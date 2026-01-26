' ============================================================================
' Slide List Item - BrightScript Logic
' ============================================================================

sub init()
    m.itemBg = m.top.findNode("itemBg")
    m.slideLabel = m.top.findNode("slideLabel")
    m.duration = m.top.findNode("duration")
    m.typeIconText = m.top.findNode("typeIconText")

    ' Icons for slide types
    m.typeIcons = {
        overview: "📊",
        top3: "🏆",
        "column-active": "🟢",
        "column-on_hold": "🟡",
        "column-completed": "🔵",
        "column-archived": "⚫",
        logo: "🎨",
        video: "🎬",
        youtube: "▶️",
        reddit: "🤖",
        "hacker-news": "📰",
        "recent-issues": "🐛",
        "recent-commits": "💻"
    }
end sub

sub onContentChange()
    content = m.top.itemContent
    if content = invalid then return

    ' Set label
    label = content.label
    if label = invalid then label = "Unknown Slide"
    m.slideLabel.text = label

    ' Set duration
    duration = content.duration
    if duration = invalid then duration = 20
    m.duration.text = str(duration).trim() + "s"

    ' Set icon
    slideType = content.slideType
    if slideType = invalid then slideType = "overview"

    icon = m.typeIcons[slideType]
    if icon = invalid then icon = "📊"
    m.typeIconText.text = icon
end sub

sub onFocusChange()
    focusPercent = m.top.focusPercent

    if focusPercent > 0.5
        m.itemBg.color = "#3f3f46"
    else
        m.itemBg.color = "#27272a"
    end if
end sub
