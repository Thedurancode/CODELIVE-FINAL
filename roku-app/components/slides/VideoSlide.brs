' ============================================================================
' Video Slide - BrightScript Logic
' ============================================================================

sub init()
    m.videoPlayer = m.top.findNode("videoPlayer")
    m.loadingOverlay = m.top.findNode("loadingOverlay")
    m.errorOverlay = m.top.findNode("errorOverlay")
    m.errorLabel = m.top.findNode("errorLabel")

    ' Observe video state
    m.videoPlayer.observeField("state", "onVideoStateChange")
    m.videoPlayer.observeField("errorMsg", "onVideoError")

    ' Stop video when hidden
    m.top.observeField("visible", "onVisibleChange")
end sub

sub onVideoUrlChange()
    url = m.top.videoUrl
    if url = invalid or url = ""
        return
    end if

    print "VideoSlide: Loading video - " + url

    ' Reset state
    m.loadingOverlay.visible = true
    m.errorOverlay.visible = false

    ' Create content node for video
    content = CreateObject("roSGNode", "ContentNode")
    content.url = url
    content.streamFormat = "mp4"

    m.videoPlayer.content = content
    m.videoPlayer.control = "play"
end sub

sub onVideoStateChange()
    state = m.videoPlayer.state
    print "VideoSlide: State changed to " + state

    if state = "playing"
        m.loadingOverlay.visible = false
        m.errorOverlay.visible = false
    else if state = "error"
        m.loadingOverlay.visible = false
        m.errorOverlay.visible = true
    else if state = "finished"
        if m.top.loop
            m.videoPlayer.seek = 0
            m.videoPlayer.control = "play"
        end if
    end if
end sub

sub onVideoError()
    errorMsg = m.videoPlayer.errorMsg
    print "VideoSlide: Error - " + errorMsg

    m.errorLabel.text = "Error: " + errorMsg
    m.loadingOverlay.visible = false
    m.errorOverlay.visible = true
end sub

sub onVisibleChange()
    if m.top.visible
        if m.top.videoUrl <> invalid and m.top.videoUrl <> ""
            m.videoPlayer.control = "play"
        end if
    else
        m.videoPlayer.control = "stop"
    end if
end sub
