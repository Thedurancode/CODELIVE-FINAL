# CodeLive TV - Roku App

A native Roku application that displays your CodeLive projects in a beautiful slideshow format, mirroring the functionality of the web-based TV display.

## Features

- **Project Kanban Board**: View all projects organized by status (Active, On Hold, Completed, Archived)
- **Top 3 Projects**: Highlight your most active projects
- **Single Column Views**: Focus on projects in a specific status
- **Logo Slide**: Full-screen animated branding
- **Video Playback**: Play MP4 videos directly
- **YouTube Integration**: Display YouTube videos (launches YouTube app)
- **Reddit Feed**: Show trending posts from configurable subreddits
- **Hacker News**: Display top stories from HN
- **GitHub Integration**: Show recent issues and commits
- **Auto-advancement**: Configurable slide durations with smooth progress bar
- **Remote Control**: Full Roku remote support for navigation

## Prerequisites

1. **Roku Device** for testing (or Roku emulator)
2. **Roku Developer Account**: Sign up at https://developer.roku.com
3. **Developer Mode** enabled on your Roku device

### Enable Developer Mode on Roku

1. Using your Roku remote, press: Home 3x, Up 2x, Right, Left, Right, Left, Right
2. Note the IP address shown
3. Set a password for developer access
4. Access the dev console at `http://<roku-ip>:8060`

## Project Structure

```
roku-app/
├── manifest                    # App configuration
├── source/
│   └── main.brs               # Entry point
├── components/
│   ├── MainScene.xml/brs      # Root scene with slideshow logic
│   ├── slides/                # Slide type components
│   │   ├── ProjectsSlide.*    # Kanban/Top3/Column views
│   │   ├── LogoSlide.*        # Animated logo
│   │   ├── VideoSlide.*       # MP4 video player
│   │   ├── YouTubeSlide.*     # YouTube integration
│   │   ├── RedditSlide.*      # Reddit feed
│   │   ├── HackerNewsSlide.*  # HN stories
│   │   └── GitHubSlide.*      # Issues/commits
│   ├── controls/
│   │   └── SettingsPanel.*    # Slideshow settings UI
│   ├── common/                # Reusable components
│   │   ├── ProjectCard.*      # Project display card
│   │   ├── ProjectCardLarge.* # Featured project card
│   │   ├── RedditPost.*       # Reddit post item
│   │   ├── HackerNewsStory.*  # HN story item
│   │   ├── GitHubItem.*       # Issue/commit item
│   │   └── SlideListItem.*    # Settings list item
│   └── tasks/                 # Background data tasks
│       ├── ProjectsTask.*     # Fetch projects from API
│       ├── RedditTask.*       # Fetch Reddit posts
│       ├── HackerNewsTask.*   # Fetch HN stories
│       └── GitHubTask.*       # Fetch GitHub data
├── images/                    # App icons and assets
└── locale/                    # Localization files
```

## Setup

### 1. Configure API URL

Edit `source/main.brs` and update the API URL:

```brightscript
scene.config = {
    apiUrl: "https://your-api-url.com",  ' Change this
    wsUrl: "wss://your-api-url.com",
    debug: true
}
```

### 2. Add Required Images

Place the following images in the `images/` folder:

| File | Size | Description |
|------|------|-------------|
| `icon_focus_hd.png` | 540x405 | Channel icon (focused) |
| `icon_focus_sd.png` | 246x140 | SD channel icon |
| `icon_side_hd.png` | 108x81 | Side panel icon |
| `icon_side_sd.png` | 55x41 | SD side panel icon |
| `splash_hd.jpg` | 1920x1080 | HD splash screen |
| `splash_sd.jpg` | 720x480 | SD splash screen |
| `logo.png` | 200x60 | Header logo |
| `logo-large.png` | 400x400 | Logo slide image |
| `spinner.png` | 100x100 | Loading spinner |
| `glow.png` | 800x800 | Logo glow effect |
| `reddit-logo.png` | 40x40 | Reddit icon |
| `github-logo.png` | 40x40 | GitHub icon |
| `youtube-play.png` | 120x84 | YouTube play button |

### 3. Package the App

#### Option A: Using make_roku_package.sh (Recommended)

```bash
# Create the script
cat > make_roku_package.sh << 'EOF'
#!/bin/bash
cd roku-app
zip -r ../codelive-roku.zip . -x "*.DS_Store" -x "*.git*" -x "README.md"
echo "Package created: codelive-roku.zip"
EOF

chmod +x make_roku_package.sh
./make_roku_package.sh
```

#### Option B: Manual Zip

```bash
cd roku-app
zip -r ../codelive-roku.zip manifest source components images locale
```

### 4. Deploy to Roku

#### Development Deployment

1. Open your browser to `http://<roku-ip>` (replace with your Roku's IP)
2. Log in with your developer credentials
3. Click "Upload" and select `codelive-roku.zip`
4. The app will install and launch automatically

#### Using curl

```bash
curl --user rokudev:<password> \
     --digest \
     -F "mysubmit=Install" \
     -F "archive=@codelive-roku.zip" \
     http://<roku-ip>/plugin_install
```

## Remote Control Mapping

| Button | Action |
|--------|--------|
| **Right** | Next slide |
| **Left** | Previous slide |
| **OK / Play** | Pause/Resume slideshow |
| **Options / Info** | Open settings panel |
| **Back** | Close settings |
| **Replay** | Restart current slide |

## Configuration

### Slideshow Settings

Settings are stored in the Roku registry and persist across sessions. Default configuration:

```brightscript
{
    enabled: true,
    slides: [
        { type: "overview", duration: 20, label: "All Projects" },
        { type: "column-active", duration: 20, label: "In Talks" },
        { type: "top3", duration: 15, label: "Top 3 Projects" },
        { type: "reddit", duration: 30, label: "Reddit Feed" },
        { type: "hacker-news", duration: 25, label: "Hacker News" },
        { type: "logo", duration: 5, label: "CodeLive" }
    ],
    redditSubreddits: ["programming", "technology", "webdev", "javascript", "reactjs"]
}
```

### Available Slide Types

| Type | Description |
|------|-------------|
| `overview` | Full kanban board with all columns |
| `top3` | Top 3 most active projects |
| `column-active` | Only "In Talks" projects |
| `column-on_hold` | Only "On Hold" projects |
| `column-completed` | Only completed projects |
| `column-archived` | Only archived projects |
| `logo` | Animated logo display |
| `video` | MP4 video playback (requires `url`) |
| `youtube` | YouTube video (requires `url`) |
| `reddit` | Reddit feed from configured subreddits |
| `hacker-news` | Hacker News top stories |
| `recent-issues` | GitHub issues |
| `recent-commits` | GitHub commits |

## API Requirements

The app expects your backend API to provide the following endpoints:

### Projects
```
GET /api/projects?limit=200
Response: { success: true, data: Project[] }
```

### GitHub (optional)
```
GET /api/github/issues?limit=20
GET /api/github/commits?limit=20
Response: { success: true, data: Issue[] | Commit[] }
```

## Publishing to Roku Channel Store

1. **Create a Channel** at https://developer.roku.com/developer-channels
2. **Upload your package** (signed production build)
3. **Fill out channel details**:
   - Name: CodeLive TV
   - Category: Utilities
   - Description: Project management dashboard
4. **Submit for certification**

### Certification Requirements

- App must load within 20 seconds
- All text must be readable on TV
- Remote navigation must be intuitive
- No crashes or ANR (App Not Responding)
- Proper error handling for network failures

## Troubleshooting

### App won't install
- Ensure Developer Mode is enabled
- Check that the zip contains `manifest` at the root
- Verify all referenced images exist

### No projects showing
- Check API URL configuration
- Verify API returns proper JSON format
- Check Roku console for network errors

### Video won't play
- Ensure video URL is HTTPS
- Check video format is supported (MP4, HLS)
- Verify CORS headers on video server

### Console/Debug Output
```bash
# Stream debug output via telnet
telnet <roku-ip> 8085
```

## Development Tips

1. **Use BrightScript debugger**: Connect via telnet to port 8085
2. **Test on actual device**: Emulator behavior differs from real devices
3. **Check memory usage**: Roku devices have limited RAM
4. **Optimize images**: Use appropriate sizes to reduce memory

## License

Part of the CodeLive platform. For internal use only.
