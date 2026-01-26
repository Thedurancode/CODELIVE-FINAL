' ============================================================================
' Reddit Slide - BrightScript Logic
' ============================================================================

sub init()
    m.loadingOverlay = m.top.findNode("loadingOverlay")
    m.subredditLabel = m.top.findNode("subredditLabel")

    m.postNodes = [
        m.top.findNode("post1"),
        m.top.findNode("post2"),
        m.top.findNode("post3"),
        m.top.findNode("post4"),
        m.top.findNode("post5"),
        m.top.findNode("post6"),
        m.top.findNode("post7"),
        m.top.findNode("post8")
    ]

    m.top.observeField("visible", "onVisibleChange")
end sub

sub onSubredditsChange()
    subreddits = m.top.subreddits
    if subreddits = invalid or subreddits.count() = 0
        return
    end if

    ' Update label
    labelParts = []
    for i = 0 to min(2, subreddits.count() - 1)
        labelParts.push("r/" + subreddits[i])
    end for
    if subreddits.count() > 3
        labelParts.push("+" + str(subreddits.count() - 3) + " more")
    end if
    m.subredditLabel.text = join(labelParts, " + ")

    ' Fetch posts
    fetchRedditPosts(subreddits)
end sub

sub fetchRedditPosts(subreddits as object)
    m.loadingOverlay.visible = true

    ' Create task to fetch Reddit data
    m.redditTask = CreateObject("roSGNode", "RedditTask")
    m.redditTask.observeField("posts", "onPostsLoaded")
    m.redditTask.observeField("error", "onRedditError")
    m.redditTask.subreddits = subreddits
    m.redditTask.control = "run"
end sub

sub onPostsLoaded()
    posts = m.redditTask.posts
    if posts = invalid
        return
    end if

    m.loadingOverlay.visible = false
    m.top.posts = posts

    ' Populate post nodes
    for i = 0 to min(7, posts.count() - 1)
        m.postNodes[i].post = posts[i]
        m.postNodes[i].visible = true
    end for

    ' Hide unused nodes
    for i = posts.count() to 7
        m.postNodes[i].visible = false
    end for

    print "RedditSlide: Loaded " + str(posts.count()) + " posts"
end sub

sub onRedditError()
    print "RedditSlide: Error loading posts"
    m.loadingOverlay.visible = false
end sub

sub onVisibleChange()
    if m.top.visible
        ' Refresh data when slide becomes visible
        if m.top.subreddits <> invalid and m.top.subreddits.count() > 0
            fetchRedditPosts(m.top.subreddits)
        end if
    end if
end sub

function min(a as integer, b as integer) as integer
    if a < b then return a
    return b
end function

function join(arr as object, separator as string) as string
    result = ""
    for i = 0 to arr.count() - 1
        if i > 0 then result = result + separator
        result = result + arr[i]
    end for
    return result
end function
