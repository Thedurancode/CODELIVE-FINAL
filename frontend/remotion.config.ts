/**
 * Remotion Configuration
 *
 * Configuration for Remotion video rendering.
 * Run `npx remotion studio` to preview compositions.
 */

import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);

// Use high quality for final renders
Config.setJpegQuality(80);

// Enable multi-threading for faster renders
Config.setConcurrency(4);
