' ============================================================================
' GitHub Item - BrightScript Logic
' ============================================================================

sub init()
    m.icon = m.top.findNode("icon")
    m.title = m.top.findNode("title")
    m.meta = m.top.findNode("meta")
    m.stateBadge = m.top.findNode("stateBadge")
    m.stateLabel = m.top.findNode("stateLabel")
end sub

sub onContentChange()
    content = m.top.itemContent
    if content = invalid then return

    ' Check if it's an issue or commit
    isIssue = content.title <> invalid

    if isIssue
        renderIssue(content)
    else
        renderCommit(content)
    end if
end sub

sub renderIssue(content as object)
    m.icon.text = "🐛"

    ' Set title
    title = content.title
    if title = invalid then title = "Untitled Issue"
    m.title.text = title

    ' Set meta
    repo = content.repo
    number = content.number
    author = content.author

    if repo = invalid then repo = "unknown/repo"
    if number = invalid then number = 0
    if author = invalid then author = "unknown"

    m.meta.text = repo + " • #" + str(number).trim() + " • by " + author

    ' Set state
    state = content.state
    if state = invalid then state = "open"

    if state = "open"
        m.stateBadge.color = "#22c55e"
    else
        m.stateBadge.color = "#8b5cf6"
    end if
    m.stateLabel.text = state
    m.stateBadge.visible = true
end sub

sub renderCommit(content as object)
    m.icon.text = "💻"

    ' Set message
    message = content.message
    if message = invalid then message = "No commit message"

    ' Truncate to first line
    if message.instr(chr(10)) >= 0
        message = message.split(chr(10))[0]
    end if
    m.title.text = message

    ' Set meta
    repo = content.repo
    sha = content.sha
    author = content.author

    if repo = invalid then repo = "unknown/repo"
    if sha = invalid then sha = "0000000"
    if author = invalid then author = "unknown"

    ' Shorten SHA
    shortSha = left(sha, 7)

    m.meta.text = repo + " • " + shortSha + " • by " + author

    ' Hide state badge for commits
    m.stateBadge.visible = false
end sub
