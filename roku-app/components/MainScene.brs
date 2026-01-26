' ============================================================================
' CodeLive TV - Main Scene (Minimal Test Version)
' ============================================================================

sub init()
    print "MainScene: Initializing..."

    m.title = m.top.findNode("title")
    m.subtitle = m.top.findNode("subtitle")
    m.status = m.top.findNode("status")

    ' Update status
    m.subtitle.text = "App Started!"
    m.status.text = "Press OK to test"

    ' IMPORTANT: Set focus to receive key events
    m.top.setFocus(true)

    print "MainScene: Init complete"
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false

    print "MainScene: Key pressed - " + key

    if key = "OK"
        m.status.text = "OK pressed! Fetching data..."
        fetchProjects()
        return true
    end if

    return false
end function

sub fetchProjects()
    print "MainScene: Creating task..."

    m.projectsTask = CreateObject("roSGNode", "ProjectsTask")
    m.projectsTask.observeField("projects", "onProjectsLoaded")
    m.projectsTask.observeField("error", "onProjectsError")
    m.projectsTask.apiUrl = "https://dispotree-api.fly.dev"
    ' Note: Using /api/projects/tv-display (public endpoint, no auth required)
    m.projectsTask.control = "run"

    m.status.text = "Fetching projects..."
end sub

sub onProjectsLoaded()
    projects = m.projectsTask.projects
    if projects <> invalid
        count = projects.count()
        m.subtitle.text = "Loaded " + str(count).trim() + " projects!"
        m.status.text = "Success!"
        print "MainScene: Loaded " + str(count) + " projects"
    else
        m.subtitle.text = "No projects found"
        m.status.text = "Empty response"
    end if
end sub

sub onProjectsError()
    errorMsg = m.projectsTask.error
    m.subtitle.text = "Error!"
    m.status.text = errorMsg
    print "MainScene: Error - " + errorMsg
end sub
