' ============================================================================
' Reddit Post - BrightScript Logic
' ============================================================================

sub init()
    m.title = m.top.findNode("title")
    m.meta = m.top.findNode("meta")
    m.score = m.top.findNode("score")
    m.comments = m.top.findNode("comments")
end sub

sub onPostChange()
    post = m.top.post
    if post = invalid then return

    ' Set title
    title = post.title
    if title = invalid then title = "Untitled"
    m.title.text = title

    ' Set meta (subreddit + author)
    subreddit = post.subreddit
    author = post.author
    if subreddit = invalid then subreddit = "unknown"
    if author = invalid then author = "unknown"
    m.meta.text = "r/" + subreddit + " • u/" + author

    ' Set score
    score = post.score
    if score = invalid then score = 0
    m.score.text = formatScore(score)

    ' Set comments
    numComments = post.numComments
    if numComments = invalid then numComments = 0
    m.comments.text = str(numComments).trim() + " comments"
end sub

function formatScore(score as integer) as string
    if score >= 10000
        return str(int(score / 1000)).trim() + "k"
    else if score >= 1000
        return str(score / 1000).left(3) + "k"
    end if
    return str(score).trim()
end function
