' ============================================================================
' GitHub Slide - BrightScript Logic
' ============================================================================

sub init()
    m.loadingOverlay = m.top.findNode("loadingOverlay")
    m.itemsGrid = m.top.findNode("itemsGrid")
    m.headerTitle = m.top.findNode("headerTitle")
    m.headerSubtitle = m.top.findNode("headerSubtitle")
    m.loadingText = m.top.findNode("loadingText")

    m.top.observeField("visible", "onVisibleChange")
    m.top.observeField("slideType", "onSlideTypeChange")
end sub

sub onSlideTypeChange()
    slideType = m.top.slideType

    if slideType = "recent-issues"
        m.headerTitle.text = "Recent Issues"
        m.headerSubtitle.text = "From your repositories"
        m.loadingText.text = "Loading issues..."
    else if slideType = "recent-commits"
        m.headerTitle.text = "Recent Commits"
        m.headerSubtitle.text = "Latest activity"
        m.loadingText.text = "Loading commits..."
    end if
end sub

sub onVisibleChange()
    if m.top.visible
        fetchGitHubData()
    end if
end sub

sub fetchGitHubData()
    m.loadingOverlay.visible = true

    ' Create task to fetch GitHub data
    m.ghTask = CreateObject("roSGNode", "GitHubTask")
    m.ghTask.observeField("items", "onItemsLoaded")
    m.ghTask.observeField("error", "onGHError")
    m.ghTask.slideType = m.top.slideType
    m.ghTask.control = "run"
end sub

sub onItemsLoaded()
    items = m.ghTask.items
    if items = invalid
        return
    end if

    m.loadingOverlay.visible = false
    m.top.items = items

    ' Create content node for grid
    content = CreateObject("roSGNode", "ContentNode")

    for each item in items
        node = content.createChild("ContentNode")
        if m.top.slideType = "recent-issues"
            node.addFields({
                title: item.title,
                repo: item.repository,
                state: item.state,
                number: item.number,
                createdAt: item.createdAt,
                author: item.author
            })
        else
            node.addFields({
                message: item.message,
                repo: item.repository,
                sha: item.sha,
                author: item.author,
                committedAt: item.committedAt
            })
        end if
    end for

    m.itemsGrid.content = content

    print "GitHubSlide: Loaded " + str(items.count()) + " items"
end sub

sub onGHError()
    print "GitHubSlide: Error loading data"
    m.loadingOverlay.visible = false
end sub
