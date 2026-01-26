' ============================================================================
' Projects Slide - BrightScript Logic
' ============================================================================

sub init()
    m.kanbanLayout = m.top.findNode("kanbanLayout")
    m.top3Layout = m.top.findNode("top3Layout")
    m.singleColumnLayout = m.top.findNode("singleColumnLayout")

    ' Column grids
    m.activeGrid = m.top.findNode("activeGrid")
    m.onHoldGrid = m.top.findNode("onHoldGrid")
    m.completedGrid = m.top.findNode("completedGrid")
    m.archivedGrid = m.top.findNode("archivedGrid")
    m.singleColumnGrid = m.top.findNode("singleColumnGrid")

    ' Count labels
    m.activeCount = m.top.findNode("activeCount")
    m.onHoldCount = m.top.findNode("onHoldCount")
    m.completedCount = m.top.findNode("completedCount")
    m.archivedCount = m.top.findNode("archivedCount")
    m.singleColumnCount = m.top.findNode("singleColumnCount")

    ' Top 3 cards
    m.top3Cards = [
        m.top.findNode("top3Card1"),
        m.top.findNode("top3Card2"),
        m.top.findNode("top3Card3")
    ]

    ' Single column styling
    m.singleColumnHeader = m.top.findNode("singleColumnHeader")
    m.singleColumnLabel = m.top.findNode("singleColumnLabel")

    ' Column colors
    m.columnColors = {
        active: "#22c55e",
        on_hold: "#eab308",
        completed: "#3b82f6",
        archived: "#71717a"
    }

    ' Column labels
    m.columnLabels = {
        active: "In Talks",
        on_hold: "On Hold",
        completed: "Completed",
        archived: "Archived"
    }
end sub

sub onProjectsChange()
    projects = m.top.projects
    if projects = invalid or projects.count() = 0
        return
    end if

    slideType = m.top.slideType
    print "ProjectsSlide: Rendering " + str(projects.count()) + " projects as " + slideType

    ' Hide all layouts first
    m.kanbanLayout.visible = false
    m.top3Layout.visible = false
    m.singleColumnLayout.visible = false

    if slideType = "overview"
        renderKanbanView(projects)
        m.kanbanLayout.visible = true
    else if slideType = "top3"
        renderTop3View(projects)
        m.top3Layout.visible = true
    else if slideType.instr("column-") = 0
        status = slideType.replace("column-", "")
        renderSingleColumn(projects, status)
        m.singleColumnLayout.visible = true
    end if
end sub

sub renderKanbanView(projects as object)
    ' Categorize projects by status
    active = []
    onHold = []
    completed = []
    archived = []

    for each project in projects
        status = lcase(project.status)
        if status = "active" or status = "in_talks" or status = "in talks"
            active.push(project)
        else if status = "on_hold" or status = "on hold"
            onHold.push(project)
        else if status = "completed"
            completed.push(project)
        else if status = "archived"
            archived.push(project)
        end if
    end for

    ' Update grids
    m.activeGrid.content = createContentNode(active)
    m.onHoldGrid.content = createContentNode(onHold)
    m.completedGrid.content = createContentNode(completed)
    m.archivedGrid.content = createContentNode(archived)

    ' Update counts
    m.activeCount.text = str(active.count())
    m.onHoldCount.text = str(onHold.count())
    m.completedCount.text = str(completed.count())
    m.archivedCount.text = str(archived.count())
end sub

sub renderTop3View(projects as object)
    ' Sort by activity/priority (using updatedAt or a score)
    sortedProjects = sortProjectsByActivity(projects)

    ' Display top 3
    for i = 0 to 2
        if i < sortedProjects.count()
            m.top3Cards[i].project = sortedProjects[i]
            m.top3Cards[i].visible = true
        else
            m.top3Cards[i].visible = false
        end if
    end for
end sub

sub renderSingleColumn(projects as object, status as string)
    ' Filter projects by status
    filtered = []
    for each project in projects
        projectStatus = lcase(project.status)
        if status = "active" and (projectStatus = "active" or projectStatus = "in_talks" or projectStatus = "in talks")
            filtered.push(project)
        else if status = "on_hold" and (projectStatus = "on_hold" or projectStatus = "on hold")
            filtered.push(project)
        else if projectStatus = status
            filtered.push(project)
        end if
    end for

    ' Update grid
    m.singleColumnGrid.content = createContentNode(filtered)
    m.singleColumnCount.text = str(filtered.count())

    ' Update styling
    color = m.columnColors[status]
    if color = invalid then color = "#ffffff"

    m.singleColumnHeader.color = color
    m.singleColumnHeader.opacity = 0.2
    m.singleColumnLabel.color = color
    m.singleColumnLabel.text = m.columnLabels[status]
    m.singleColumnCount.color = color
end sub

function createContentNode(projects as object) as object
    content = CreateObject("roSGNode", "ContentNode")

    for each project in projects
        item = content.createChild("ContentNode")
        item.addFields({
            title: project.name,
            description: project.description,
            status: project.status,
            updatedAt: project.updatedAt,
            clientName: project.clientName,
            githubRepo: project.githubRepo
        })
    end for

    return content
end function

function sortProjectsByActivity(projects as object) as object
    ' Simple sort by updatedAt (most recent first)
    sorted = []
    for each project in projects
        sorted.push(project)
    end for

    ' Bubble sort (good enough for small lists)
    n = sorted.count()
    for i = 0 to n - 2
        for j = 0 to n - i - 2
            if compareUpdatedAt(sorted[j], sorted[j + 1]) < 0
                temp = sorted[j]
                sorted[j] = sorted[j + 1]
                sorted[j + 1] = temp
            end if
        end for
    end for

    return sorted
end function

function compareUpdatedAt(a as object, b as object) as integer
    aDate = a.updatedAt
    bDate = b.updatedAt

    if aDate = invalid then aDate = ""
    if bDate = invalid then bDate = ""

    if aDate > bDate then return 1
    if aDate < bDate then return -1
    return 0
end function
