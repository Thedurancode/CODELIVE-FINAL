' ============================================================================
' YouTube Slide - BrightScript Logic
' ============================================================================
' Note: Direct YouTube playback requires Roku certification.
' This implementation shows a thumbnail with option to launch YouTube app.
' ============================================================================

sub init()
    m.ytPlayer = m.top.findNode("ytPlayer")
    m.fallbackView = m.top.findNode("fallbackView")
    m.loadingOverlay = m.top.findNode("loadingOverlay")
    m.thumbnail = m.top.findNode("thumbnail")
    m.videoTitle = m.top.findNode("videoTitle")

    m.top.observeField("visible", "onVisibleChange")
end sub

sub onVideoIdChange()
    videoId = m.top.videoId
    if videoId = invalid or videoId = ""
        return
    end if

    print "YouTubeSlide: Loading video ID - " + videoId

    m.loadingOverlay.visible = true

    ' Set thumbnail URL (YouTube provides standard thumbnails)
    m.thumbnail.uri = "https://img.youtube.com/vi/" + videoId + "/maxresdefault.jpg"

    ' For now, show fallback view since direct playback needs certification
    showFallbackView(videoId)
end sub

sub showFallbackView(videoId as string)
    m.loadingOverlay.visible = false
    m.fallbackView.visible = true
    m.ytPlayer.visible = false

    ' You could fetch video metadata from YouTube API here
    m.videoTitle.text = "YouTube Video"

    ' Store video ID for potential launch
    m.currentVideoId = videoId
end sub

sub onVisibleChange()
    if not m.top.visible
        m.ytPlayer.control = "stop"
    end if
end sub

' Handle OK button to launch YouTube app
function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false

    if key = "OK" and m.fallbackView.visible
        launchYouTubeApp()
        return true
    end if

    return false
end function

sub launchYouTubeApp()
    if m.currentVideoId = invalid then return

    ' Launch YouTube app with deep link
    ' YouTube Roku app ID: 837
    appManager = CreateObject("roAppManager")

    params = {
        contentId: m.currentVideoId,
        mediaType: "video"
    }

    print "YouTubeSlide: Launching YouTube app with video " + m.currentVideoId
    appManager.LaunchApp(837, params)
end sub
