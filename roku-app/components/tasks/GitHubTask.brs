' ============================================================================
' GitHub Task - Fetches issues or commits via your backend API
' ============================================================================

sub init()
    m.top.functionName = "fetchGitHubData"
end sub

sub fetchGitHubData()
    apiUrl = m.top.apiUrl
    slideType = m.top.slideType

    if apiUrl = invalid or apiUrl = ""
        ' Try to get from registry if not passed
        registry = CreateObject("roRegistrySection", "codelive")
        apiUrl = registry.read("apiUrl")
        if apiUrl = "" then apiUrl = "https://dispotree-api.fly.dev"
    end if

    ' Determine endpoint based on slide type
    endpoint = ""
    if slideType = "recent-issues"
        endpoint = "/api/github/issues"
    else if slideType = "recent-commits"
        endpoint = "/api/github/commits"
    end if

    url = apiUrl + endpoint + "?limit=20"
    print "GitHubTask: Fetching from " + url

    request = CreateObject("roUrlTransfer")
    request.setUrl(url)
    request.setCertificatesFile("common:/certs/ca-bundle.crt")
    request.initClientCertificates()
    request.addHeader("Content-Type", "application/json")

    port = CreateObject("roMessagePort")
    request.setMessagePort(port)

    items = []

    if request.asyncGetToString()
        msg = wait(15000, port)

        if type(msg) = "roUrlEvent"
            responseCode = msg.getResponseCode()
            response = msg.getString()

            if responseCode = 200
                json = parseJSON(response)

                if json <> invalid and json.data <> invalid
                    items = json.data
                else if json <> invalid and type(json) = "roArray"
                    items = json
                end if

                print "GitHubTask: Fetched " + str(items.count()) + " items"
            else
                m.top.error = "HTTP " + str(responseCode)
                print "GitHubTask: Error - HTTP " + str(responseCode)
            end if
        else
            m.top.error = "Request timeout"
        end if
    else
        m.top.error = "Failed to send request"
    end if

    m.top.items = items
end sub
