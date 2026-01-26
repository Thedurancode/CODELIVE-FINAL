' ============================================================================
' Reddit Task - Fetches posts from Reddit
' ============================================================================

sub init()
    m.top.functionName = "fetchPosts"
end sub

sub fetchPosts()
    subreddits = m.top.subreddits
    if subreddits = invalid or subreddits.count() = 0
        m.top.error = "No subreddits configured"
        return
    end if

    allPosts = []

    ' Fetch from each subreddit
    for each subreddit in subreddits
        posts = fetchSubreddit(subreddit)
        for each post in posts
            allPosts.push(post)
        end for
    end for

    ' Sort by score (descending)
    sortedPosts = sortByScore(allPosts)

    ' Return top 20
    result = []
    for i = 0 to min(19, sortedPosts.count() - 1)
        result.push(sortedPosts[i])
    end for

    m.top.posts = result
    print "RedditTask: Fetched " + str(result.count()) + " total posts"
end sub

function fetchSubreddit(subreddit as string) as object
    url = "https://www.reddit.com/r/" + subreddit + "/hot.json?limit=10"
    print "RedditTask: Fetching " + url

    request = CreateObject("roUrlTransfer")
    request.setUrl(url)
    request.setCertificatesFile("common:/certs/ca-bundle.crt")
    request.initClientCertificates()
    request.addHeader("User-Agent", "CodeLiveTV/1.0")

    port = CreateObject("roMessagePort")
    request.setMessagePort(port)

    posts = []

    if request.asyncGetToString()
        msg = wait(10000, port)

        if type(msg) = "roUrlEvent"
            responseCode = msg.getResponseCode()
            response = msg.getString()

            if responseCode = 200
                json = parseJSON(response)

                if json <> invalid and json.data <> invalid and json.data.children <> invalid
                    for each child in json.data.children
                        post = child.data
                        posts.push({
                            title: post.title,
                            subreddit: post.subreddit,
                            author: post.author,
                            score: post.score,
                            numComments: post.num_comments,
                            url: post.url,
                            thumbnail: post.thumbnail,
                            createdUtc: post.created_utc,
                            selftext: post.selftext
                        })
                    end for
                end if
            else
                print "RedditTask: Error fetching " + subreddit + " - HTTP " + str(responseCode)
            end if
        end if
    end if

    return posts
end function

function sortByScore(posts as object) as object
    sorted = []
    for each post in posts
        sorted.push(post)
    end for

    ' Bubble sort by score
    n = sorted.count()
    for i = 0 to n - 2
        for j = 0 to n - i - 2
            if sorted[j].score < sorted[j + 1].score
                temp = sorted[j]
                sorted[j] = sorted[j + 1]
                sorted[j + 1] = temp
            end if
        end for
    end for

    return sorted
end function

function min(a as integer, b as integer) as integer
    if a < b then return a
    return b
end function
