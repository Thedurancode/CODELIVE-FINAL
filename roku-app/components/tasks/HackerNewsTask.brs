' ============================================================================
' Hacker News Task - Fetches top stories from HN API
' ============================================================================

sub init()
    m.top.functionName = "fetchStories"
end sub

sub fetchStories()
    print "HackerNewsTask: Fetching top stories..."

    ' First, get top story IDs
    topStoriesUrl = "https://hacker-news.firebaseio.com/v0/topstories.json"

    request = CreateObject("roUrlTransfer")
    request.setUrl(topStoriesUrl)
    request.setCertificatesFile("common:/certs/ca-bundle.crt")
    request.initClientCertificates()

    port = CreateObject("roMessagePort")
    request.setMessagePort(port)

    stories = []

    if request.asyncGetToString()
        msg = wait(10000, port)

        if type(msg) = "roUrlEvent"
            responseCode = msg.getResponseCode()
            response = msg.getString()

            if responseCode = 200
                storyIds = parseJSON(response)

                if storyIds <> invalid and storyIds.count() > 0
                    ' Fetch details for top 15 stories
                    maxStories = min(15, storyIds.count())

                    for i = 0 to maxStories - 1
                        story = fetchStoryDetails(storyIds[i])
                        if story <> invalid
                            stories.push(story)
                        end if
                    end for
                end if
            else
                m.top.error = "HTTP " + str(responseCode)
                print "HackerNewsTask: Error - HTTP " + str(responseCode)
            end if
        else
            m.top.error = "Request timeout"
        end if
    else
        m.top.error = "Failed to send request"
    end if

    m.top.stories = stories
    print "HackerNewsTask: Fetched " + str(stories.count()) + " stories"
end sub

function fetchStoryDetails(storyId as integer) as object
    url = "https://hacker-news.firebaseio.com/v0/item/" + str(storyId).trim() + ".json"

    request = CreateObject("roUrlTransfer")
    request.setUrl(url)
    request.setCertificatesFile("common:/certs/ca-bundle.crt")
    request.initClientCertificates()

    port = CreateObject("roMessagePort")
    request.setMessagePort(port)

    if request.asyncGetToString()
        msg = wait(5000, port)

        if type(msg) = "roUrlEvent" and msg.getResponseCode() = 200
            json = parseJSON(msg.getString())
            if json <> invalid
                return {
                    id: json.id,
                    title: json.title,
                    url: json.url,
                    score: json.score,
                    by: json.by,
                    time: json.time,
                    descendants: json.descendants
                }
            end if
        end if
    end if

    return invalid
end function

function min(a as integer, b as integer) as integer
    if a < b then return a
    return b
end function
