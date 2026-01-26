' ============================================================================
' Large Project Card - BrightScript Logic
' ============================================================================

sub init()
    m.statusBadge = m.top.findNode("statusBadge")
    m.statusLabel = m.top.findNode("statusLabel")
    m.iconLetter = m.top.findNode("iconLetter")
    m.projectName = m.top.findNode("projectName")
    m.description = m.top.findNode("description")
    m.clientName = m.top.findNode("clientName")
    m.updatedAt = m.top.findNode("updatedAt")

    ' Status colors
    m.statusColors = {
        active: "#22c55e",
        in_talks: "#22c55e",
        on_hold: "#eab308",
        completed: "#3b82f6",
        archived: "#71717a"
    }
end sub

sub onProjectChange()
    project = m.top.project
    if project = invalid then return

    ' Set project name
    name = project.name
    if name = invalid then name = "Untitled Project"
    m.projectName.text = name

    ' Set icon letter (first letter of name)
    if name <> ""
        m.iconLetter.text = ucase(left(name, 1))
    end if

    ' Set description
    desc = project.description
    if desc = invalid then desc = "No description available"
    m.description.text = desc

    ' Set status
    status = lcase(project.status)
    if status = invalid then status = "active"

    ' Normalize status
    if status = "in talks" then status = "in_talks"
    if status = "on hold" then status = "on_hold"

    ' Set status badge
    statusColor = m.statusColors[status]
    if statusColor = invalid then statusColor = "#22c55e"
    m.statusBadge.color = statusColor

    statusText = getStatusLabel(status)
    m.statusLabel.text = statusText

    ' Set client name
    client = project.clientName
    if client = invalid or client = ""
        m.clientName.text = "—"
    else
        m.clientName.text = client
    end if

    ' Set updated time
    updatedAt = project.updatedAt
    if updatedAt <> invalid and updatedAt <> ""
        m.updatedAt.text = formatDate(updatedAt)
    else
        m.updatedAt.text = "—"
    end if
end sub

function getStatusLabel(status as string) as string
    labels = {
        active: "Active",
        in_talks: "In Talks",
        on_hold: "On Hold",
        completed: "Completed",
        archived: "Archived"
    }

    label = labels[status]
    if label = invalid then label = "Active"
    return label
end function

function formatDate(dateString as string) as string
    if dateString.instr("T") >= 0
        parts = dateString.split("T")
        datePart = parts[0]

        ' Parse YYYY-MM-DD
        dateComps = datePart.split("-")
        if dateComps.count() = 3
            months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
            month = val(dateComps[1])
            day = val(dateComps[2])

            if month > 0 and month <= 12
                return months[month - 1] + " " + str(day).trim()
            end if
        end if
    end if

    return dateString
end function
