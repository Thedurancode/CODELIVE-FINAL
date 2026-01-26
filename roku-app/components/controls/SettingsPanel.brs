' ============================================================================
' Settings Panel - BrightScript Logic
' ============================================================================

sub init()
    m.slideList = m.top.findNode("slideList")
    m.toggleBg = m.top.findNode("toggleBg")
    m.toggleKnob = m.top.findNode("toggleKnob")

    m.autoPlayEnabled = true
end sub

sub onSettingsChange()
    settings = m.top.settings
    if settings = invalid then return

    ' Update auto-play toggle
    m.autoPlayEnabled = settings.enabled
    updateToggleUI()

    ' Populate slides list
    content = CreateObject("roSGNode", "ContentNode")

    for each slide in settings.slides
        item = content.createChild("ContentNode")
        item.addFields({
            slideType: slide.type,
            label: slide.label,
            duration: slide.duration
        })
    end for

    m.slideList.content = content
end sub

sub updateToggleUI()
    if m.autoPlayEnabled
        m.toggleBg.color = "#22c55e"
        m.toggleKnob.translation = [482, 17]
    else
        m.toggleBg.color = "#3f3f46"
        m.toggleKnob.translation = [454, 17]
    end if
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false

    if key = "OK"
        ' Toggle selected item or auto-play
        focusedIndex = m.slideList.itemFocused
        if focusedIndex >= 0
            ' Could toggle slide enabled state here
        end if
        return true
    else if key = "up" or key = "down"
        ' Let the list handle focus
        return false
    else if key = "left" or key = "right"
        ' Could adjust duration
        return true
    else if key = "back"
        ' Close panel (handled by parent)
        return false
    end if

    return false
end function

sub toggleAutoPlay()
    m.autoPlayEnabled = not m.autoPlayEnabled
    updateToggleUI()

    ' Notify parent
    settings = m.top.settings
    if settings <> invalid
        settings.enabled = m.autoPlayEnabled
        m.top.onSave = settings
    end if
end sub
