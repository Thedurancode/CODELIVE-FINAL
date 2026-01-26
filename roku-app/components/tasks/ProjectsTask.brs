' ============================================================================
' Projects Task - Fetches projects from the API
' ============================================================================

sub init()
    m.top.functionName = "fetchProjects"
end sub

sub fetchProjects()
    apiUrl = m.top.apiUrl
    if apiUrl = invalid or apiUrl = ""
        m.top.error = "API URL not configured"
        return
    end if

    url = apiUrl + "/api/projects/tv-display?limit=200"
    print "ProjectsTask: Fetching from " + url

    ' Create HTTP request
    request = CreateObject("roUrlTransfer")
    request.setUrl(url)
    request.setCertificatesFile("common:/certs/ca-bundle.crt")
    request.initClientCertificates()
    request.addHeader("Content-Type", "application/json")
    request.addHeader("Accept", "application/json")

    ' Enable async with message port
    port = CreateObject("roMessagePort")
    request.setMessagePort(port)

    ' Send request
    if request.asyncGetToString()
        ' Wait for response (timeout after 30 seconds)
        msg = wait(30000, port)

        if type(msg) = "roUrlEvent"
            responseCode = msg.getResponseCode()
            response = msg.getString()

            print "ProjectsTask: Response code " + str(responseCode)

            if responseCode = 200
                ' Parse JSON response
                json = parseJSON(response)

                if json <> invalid and json.success = true and json.data <> invalid
                    m.top.projects = json.data
                    print "ProjectsTask: Successfully parsed " + str(json.data.count()) + " projects"
                else if json <> invalid and json.data <> invalid
                    ' Handle case where success field might not exist
                    m.top.projects = json.data
                else
                    m.top.error = "Invalid response format"
                    print "ProjectsTask: Invalid response format"
                end if
            else
                m.top.error = "HTTP " + str(responseCode) + ": " + response
                print "ProjectsTask: Error - " + m.top.error
            end if
        else
            m.top.error = "Request timeout"
            print "ProjectsTask: Request timeout"
        end if
    else
        m.top.error = "Failed to send request"
        print "ProjectsTask: Failed to send request"
    end if
end sub
