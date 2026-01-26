' ============================================================================
' Hacker News Slide - BrightScript Logic
' ============================================================================

sub init()
    m.loadingOverlay = m.top.findNode("loadingOverlay")
    m.storiesGrid = m.top.findNode("storiesGrid")

    m.top.observeField("visible", "onVisibleChange")
end sub

sub onVisibleChange()
    if m.top.visible
        fetchStories()
    end if
end sub

sub fetchStories()
    m.loadingOverlay.visible = true

    ' Create task to fetch HN data
    m.hnTask = CreateObject("roSGNode", "HackerNewsTask")
    m.hnTask.observeField("stories", "onStoriesLoaded")
    m.hnTask.observeField("error", "onHNError")
    m.hnTask.control = "run"
end sub

sub onStoriesLoaded()
    stories = m.hnTask.stories
    if stories = invalid
        return
    end if

    m.loadingOverlay.visible = false
    m.top.stories = stories

    ' Create content node for grid
    content = CreateObject("roSGNode", "ContentNode")

    for each story in stories
        item = content.createChild("ContentNode")
        item.addFields({
            title: story.title,
            url: story.url,
            score: story.score,
            by: story.by,
            descendants: story.descendants,
            time: story.time
        })
    end for

    m.storiesGrid.content = content

    print "HackerNewsSlide: Loaded " + str(stories.count()) + " stories"
end sub

sub onHNError()
    print "HackerNewsSlide: Error loading stories"
    m.loadingOverlay.visible = false
end sub
