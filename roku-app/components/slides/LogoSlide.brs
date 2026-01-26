' ============================================================================
' Logo Slide - BrightScript Logic
' ============================================================================

sub init()
    m.dots = [
        m.top.findNode("dot1"),
        m.top.findNode("dot2"),
        m.top.findNode("dot3")
    ]

    ' Create animation timer
    m.animTimer = CreateObject("roSGNode", "Timer")
    m.animTimer.duration = 0.5
    m.animTimer.repeat = true
    m.animTimer.observeField("fire", "onAnimationTick")

    m.animIndex = 0

    ' Start animation when visible
    m.top.observeField("visible", "onVisibleChange")
end sub

sub onVisibleChange()
    if m.top.visible
        m.animTimer.control = "start"
    else
        m.animTimer.control = "stop"
    end if
end sub

sub onAnimationTick()
    ' Cycle through dots
    for i = 0 to 2
        if i = m.animIndex
            m.dots[i].opacity = 1.0
        else if i = (m.animIndex + 1) mod 3
            m.dots[i].opacity = 0.6
        else
            m.dots[i].opacity = 0.3
        end if
    end for

    m.animIndex = (m.animIndex + 1) mod 3
end sub
