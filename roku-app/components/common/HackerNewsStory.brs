' ============================================================================
' Hacker News Story - BrightScript Logic
' ============================================================================

sub init()
    m.rank = m.top.findNode("rank")
    m.title = m.top.findNode("title")
    m.meta = m.top.findNode("meta")
    m.domain = m.top.findNode("domain")

    m.itemIndex = 0
end sub

sub onContentChange()
    content = m.top.itemContent
    if content = invalid then return

    ' Get index from parent grid
    m.itemIndex = m.itemIndex + 1
    m.rank.text = str(m.itemIndex).trim() + "."

    ' Set title
    title = content.title
    if title = invalid then title = "Untitled"
    m.title.text = title

    ' Set meta
    score = content.score
    by = content.by
    descendants = content.descendants

    if score = invalid then score = 0
    if by = invalid then by = "unknown"
    if descendants = invalid then descendants = 0

    m.meta.text = str(score).trim() + " points • by " + by + " • " + str(descendants).trim() + " comments"

    ' Extract and set domain
    url = content.url
    if url <> invalid and url <> ""
        domain = extractDomain(url)
        m.domain.text = "(" + domain + ")"
        m.domain.visible = true
    else
        m.domain.visible = false
    end if
end sub

function extractDomain(url as string) as string
    ' Remove protocol
    domain = url
    if domain.instr("://") >= 0
        parts = domain.split("://")
        if parts.count() > 1 then domain = parts[1]
    end if

    ' Remove path
    if domain.instr("/") >= 0
        parts = domain.split("/")
        domain = parts[0]
    end if

    ' Remove www.
    if domain.instr("www.") = 0
        domain = domain.mid(4)
    end if

    return domain
end function
