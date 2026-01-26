' ============================================================================
' CodeLive TV - Main Entry Point
' ============================================================================
' This is the entry point for the Roku application.
' It creates the main scene and handles the message loop.
' ============================================================================

sub Main(args as dynamic)
    print "CodeLive TV: Starting application..."

    ' Create the screen and message port
    screen = CreateObject("roSGScreen")
    m.port = CreateObject("roMessagePort")
    screen.setMessagePort(m.port)

    ' Create the main scene
    scene = screen.CreateScene("MainScene")

    ' Pass configuration to the scene
    scene.config = {
        apiUrl: "https://dispotree-api.fly.dev",
        wsUrl: "wss://dispotree-api.fly.dev",
        debug: true
    }

    ' Handle deep linking if launched with args
    if args.contentId <> invalid and args.contentId <> ""
        scene.deepLink = {
            contentId: args.contentId,
            mediaType: args.mediaType
        }
    end if

    ' Show the screen
    screen.show()

    print "CodeLive TV: Scene created, entering message loop..."

    ' Main message loop
    while true
        msg = wait(0, m.port)
        msgType = type(msg)

        if msgType = "roSGScreenEvent"
            if msg.isScreenClosed()
                print "CodeLive TV: Screen closed, exiting..."
                return
            end if
        end if
    end while
end sub

' ============================================================================
' Utility function to get device info
' ============================================================================
function getDeviceInfo() as object
    deviceInfo = CreateObject("roDeviceInfo")
    return {
        model: deviceInfo.GetModel(),
        modelDisplayName: deviceInfo.GetModelDisplayName(),
        firmware: deviceInfo.GetVersion(),
        serialNumber: deviceInfo.GetDeviceUniqueId(),
        displaySize: deviceInfo.GetDisplaySize(),
        displayMode: deviceInfo.GetDisplayMode(),
        videoMode: deviceInfo.GetVideoMode(),
        uiResolution: deviceInfo.GetUIResolution()
    }
end function
