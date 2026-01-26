' ============================================================================
' Project Card - BrightScript Logic
' ============================================================================

sub init()
    m.projectName = m.top.findNode("projectName")
    m.description = m.top.findNode("description")
    m.clientName = m.top.findNode("clientName")
    m.updatedAt = m.top.findNode("updatedAt")
end sub

sub onContentChange()
    content = m.top.itemContent
    if content = invalid then return

    ' Set project name
    title = content.title
    if title = invalid then title = "Untitled Project"
    m.projectName.text = title

    ' Set description
    desc = content.description
    if desc = invalid then desc = ""
    m.description.text = desc

    ' Set client name
    client = content.clientName
    if client <> invalid and client <> ""
        m.clientName.text = client
    else
        m.clientName.text = ""
    end if

    ' Format updated time
    updatedAt = content.updatedAt
    if updatedAt <> invalid and updatedAt <> ""
        m.updatedAt.text = formatTimeAgo(updatedAt)
    else
        m.updatedAt.text = ""
    end if
end sub

function formatTimeAgo(dateString as string) as string
    ' Simple relative time formatting
    ' In production, you'd parse the ISO date and calculate the difference

    if dateString.instr("T") >= 0
        ' ISO format - just show date part
        parts = dateString.split("T")
        return parts[0]
    end if

    return dateString
end function
