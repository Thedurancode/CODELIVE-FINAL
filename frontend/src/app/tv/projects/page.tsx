'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import type { Project, ProjectStatus, PaginatedResponse } from '@/types';
import { RefreshCw, Wifi, WifiOff, Loader2, Github, AlertTriangle, Calendar, Clock, Rocket, PauseCircle, CheckCircle2, Archive, XCircle, X, ExternalLink, CalendarDays, User, GitCommit, CircleDot, MessageSquare, Globe, Play, Maximize, Minimize, Settings, Pause, SkipForward, ChevronLeft, ChevronRight, QrCode, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useTVRemoteReceiver, generateRoomCode, type TVRemoteHandlers, type SlideConfig as RemoteSlideConfig } from '@/hooks/use-tv-remote';

// Create a client for this standalone page
const queryClient = new QueryClient();

// ============ SLIDESHOW TYPES ============
type SlideType = 'overview' | 'column-active' | 'column-on_hold' | 'column-completed' | 'column-archived' | 'logo' | 'top3' | 'video' | 'youtube' | 'recent-issues' | 'recent-commits' | 'hacker-news' | 'reddit';

interface SlideConfig {
  type: SlideType;
  duration: number; // seconds
  label: string;
  url?: string; // For video/youtube slides
}

interface SlideshowSettings {
  enabled: boolean;
  slides: SlideConfig[];
  redditSubreddits?: string[];
}

const DEFAULT_SUBREDDITS = ['news', 'technology', 'worldnews', 'science', 'business', 'stocks', 'realestate', 'programming'];

const DEFAULT_SLIDESHOW_SETTINGS: SlideshowSettings = {
  enabled: false,
  slides: [
    { type: 'overview', duration: 20, label: 'All Projects' },
    { type: 'column-active', duration: 20, label: 'In Talks' },
    { type: 'reddit', duration: 30, label: 'Reddit Feed' },
    { type: 'logo', duration: 5, label: 'Logo' },
  ],
  redditSubreddits: DEFAULT_SUBREDDITS,
};

// Load settings from localStorage
const loadSlideshowSettings = (): SlideshowSettings => {
  if (typeof window === 'undefined') return DEFAULT_SLIDESHOW_SETTINGS;
  try {
    const saved = localStorage.getItem('tv-slideshow-settings');
    if (saved) return JSON.parse(saved);
  } catch {}
  return DEFAULT_SLIDESHOW_SETTINGS;
};

// Save settings to localStorage
const saveSlideshowSettings = (settings: SlideshowSettings) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('tv-slideshow-settings', JSON.stringify(settings));
};

// ============ SETTINGS PANEL ============
function SettingsPanel({
  settings,
  onSettingsChange,
  onClose
}: {
  settings: SlideshowSettings;
  onSettingsChange: (settings: SlideshowSettings) => void;
  onClose: () => void;
}) {
  const [localSettings, setLocalSettings] = useState(settings);
  const [showVideoModal, setShowVideoModal] = useState<'video' | 'youtube' | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoLabel, setVideoLabel] = useState('');

  const availableSlides: { type: SlideType; label: string; hasUrl?: boolean }[] = [
    { type: 'overview', label: 'All Projects (Kanban)' },
    { type: 'top3', label: 'Top 3 Active Projects' },
    { type: 'recent-issues', label: 'Recent GitHub Issues' },
    { type: 'recent-commits', label: 'Recent Commits' },
    { type: 'hacker-news', label: 'Hacker News Feed' },
    { type: 'reddit', label: 'Reddit Feed' },
    { type: 'column-active', label: 'Active Column Only' },
    { type: 'column-on_hold', label: 'On Hold Column Only' },
    { type: 'column-completed', label: 'Completed Column Only' },
    { type: 'column-archived', label: 'Archived Column Only' },
    { type: 'logo', label: 'Logo Screen' },
    { type: 'video', label: 'MP4 Video', hasUrl: true },
    { type: 'youtube', label: 'YouTube Video', hasUrl: true },
  ];

  const addSlide = (type: SlideType) => {
    const slideInfo = availableSlides.find(s => s.type === type);
    if (slideInfo?.hasUrl) {
      setShowVideoModal(type as 'video' | 'youtube');
      setVideoUrl('');
      setVideoLabel('');
      return;
    }
    setLocalSettings({
      ...localSettings,
      slides: [...localSettings.slides, { type, duration: 15, label: slideInfo?.label || type }],
    });
  };

  const addVideoSlide = () => {
    if (!videoUrl.trim()) return;
    const type = showVideoModal!;
    setLocalSettings({
      ...localSettings,
      slides: [...localSettings.slides, {
        type,
        duration: type === 'youtube' ? 60 : 30,
        label: videoLabel.trim() || (type === 'youtube' ? 'YouTube Video' : 'Video'),
        url: videoUrl.trim(),
      }],
    });
    setShowVideoModal(null);
    setVideoUrl('');
    setVideoLabel('');
  };

  const updateSlideUrl = (index: number, url: string) => {
    const newSlides = [...localSettings.slides];
    newSlides[index] = { ...newSlides[index], url };
    setLocalSettings({ ...localSettings, slides: newSlides });
  };

  const removeSlide = (index: number) => {
    setLocalSettings({
      ...localSettings,
      slides: localSettings.slides.filter((_, i) => i !== index),
    });
  };

  const updateSlideDuration = (index: number, duration: number) => {
    const newSlides = [...localSettings.slides];
    newSlides[index] = { ...newSlides[index], duration };
    setLocalSettings({ ...localSettings, slides: newSlides });
  };

  const moveSlide = (index: number, direction: 'up' | 'down') => {
    const newSlides = [...localSettings.slides];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= newSlides.length) return;
    [newSlides[index], newSlides[newIndex]] = [newSlides[newIndex], newSlides[index]];
    setLocalSettings({ ...localSettings, slides: newSlides });
  };

  const handleSave = () => {
    onSettingsChange(localSettings);
    saveSlideshowSettings(localSettings);
    onClose();
  };

  const totalDuration = localSettings.slides.reduce((acc, s) => acc + s.duration, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-8" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        className="relative bg-zinc-900 rounded-3xl border border-zinc-700 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Settings className="h-7 w-7 text-emerald-400" />
            Slideshow Settings
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-zinc-800">
            <X className="h-6 w-6 text-zinc-400" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Enable toggle */}
          <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-xl">
            <div>
              <p className="text-lg font-semibold text-white">Auto-play Slideshow</p>
              <p className="text-sm text-zinc-400">Automatically cycle through slides</p>
            </div>
            <button
              onClick={() => setLocalSettings({ ...localSettings, enabled: !localSettings.enabled })}
              className={`w-14 h-8 rounded-full transition-colors ${localSettings.enabled ? 'bg-emerald-500' : 'bg-zinc-700'}`}
            >
              <div className={`w-6 h-6 rounded-full bg-white shadow-md transition-transform ${localSettings.enabled ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
          </div>

          {/* Total duration */}
          <div className="text-center p-3 bg-zinc-800/30 rounded-xl">
            <p className="text-zinc-400">Total cycle duration: <span className="text-emerald-400 font-bold">{totalDuration} seconds</span> ({Math.floor(totalDuration / 60)}m {totalDuration % 60}s)</p>
          </div>

          {/* Slides list */}
          <div className="space-y-3">
            <p className="text-lg font-semibold text-white">Slide Order</p>
            {localSettings.slides.map((slide, index) => (
              <div key={index} className="flex items-center gap-3 p-4 bg-zinc-800/50 rounded-xl">
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => moveSlide(index, 'up')}
                    disabled={index === 0}
                    className="p-1 rounded hover:bg-zinc-700 disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4 text-zinc-400 rotate-90" />
                  </button>
                  <button
                    onClick={() => moveSlide(index, 'down')}
                    disabled={index === localSettings.slides.length - 1}
                    className="p-1 rounded hover:bg-zinc-700 disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4 text-zinc-400 rotate-90" />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-white">{slide.label}</p>
                    {slide.type === 'youtube' && (
                      <span className="px-2 py-0.5 text-xs bg-red-500/20 text-red-400 rounded-full">YouTube</span>
                    )}
                    {slide.type === 'video' && (
                      <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded-full">MP4</span>
                    )}
                  </div>
                  {slide.url ? (
                    <p className="text-sm text-zinc-500 truncate max-w-xs">{slide.url}</p>
                  ) : (
                    <p className="text-sm text-zinc-500">{slide.type}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="3"
                    max="300"
                    value={slide.duration}
                    onChange={(e) => updateSlideDuration(index, parseInt(e.target.value) || 5)}
                    className="w-16 px-2 py-1 bg-zinc-700 rounded-lg text-white text-center"
                  />
                  <span className="text-zinc-400 text-sm">sec</span>
                </div>
                <button
                  onClick={() => removeSlide(index)}
                  className="p-2 rounded-lg hover:bg-red-500/20 text-red-400"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            ))}
          </div>

          {/* Add slide */}
          <div className="space-y-3">
            <p className="text-lg font-semibold text-white">Add Slide</p>
            <div className="flex flex-wrap gap-2">
              {availableSlides.filter(s => !s.hasUrl).map((slide) => (
                <button
                  key={slide.type}
                  onClick={() => addSlide(slide.type)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-white transition-colors"
                >
                  + {slide.label}
                </button>
              ))}
            </div>
            <p className="text-lg font-semibold text-white mt-4">Add Media</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => addSlide('video')}
                className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-lg text-sm text-blue-400 transition-colors flex items-center gap-2"
              >
                <Play className="h-4 w-4" />
                MP4 Video
              </button>
              <button
                onClick={() => addSlide('youtube')}
                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 rounded-lg text-sm text-red-400 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
                YouTube Video
              </button>
            </div>
          </div>
        </div>

        {/* Video URL Modal */}
        {showVideoModal && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-6 z-10">
            <div className="bg-zinc-800 rounded-2xl p-6 w-full max-w-md space-y-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-3">
                {showVideoModal === 'youtube' ? (
                  <>
                    <svg className="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                    Add YouTube Video
                  </>
                ) : (
                  <>
                    <Play className="h-6 w-6 text-blue-400" />
                    Add MP4 Video
                  </>
                )}
              </h3>
              <div>
                <label className="block text-sm text-zinc-400 mb-2">
                  {showVideoModal === 'youtube' ? 'YouTube URL' : 'Video URL (MP4)'}
                </label>
                <input
                  type="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder={showVideoModal === 'youtube' ? 'https://youtube.com/watch?v=...' : 'https://example.com/video.mp4'}
                  className="w-full px-4 py-3 bg-zinc-700 rounded-xl text-white placeholder-zinc-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Label (optional)</label>
                <input
                  type="text"
                  value={videoLabel}
                  onChange={(e) => setVideoLabel(e.target.value)}
                  placeholder="My Video"
                  className="w-full px-4 py-3 bg-zinc-700 rounded-xl text-white placeholder-zinc-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowVideoModal(null)}
                  className="flex-1 px-4 py-3 bg-zinc-700 hover:bg-zinc-600 rounded-xl text-white font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={addVideoSlide}
                  disabled={!videoUrl.trim()}
                  className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-medium"
                >
                  Add Slide
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-4 p-6 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-white font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-white font-semibold"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ LOGO SLIDE ============
function LogoSlide() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Dynamic import Three.js to avoid SSR issues
    const initThree = async () => {
      const THREE = await import('three');

      const container = containerRef.current;
      if (!container) return;

      // Scene setup
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 2000);
      camera.position.z = 100;

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // ============ PARTICLE SYSTEM 1: Flowing particles ============
      const particleCount1 = 3000;
      const positions1 = new Float32Array(particleCount1 * 3);
      const colors1 = new Float32Array(particleCount1 * 3);
      const sizes1 = new Float32Array(particleCount1);

      for (let i = 0; i < particleCount1; i++) {
        positions1[i * 3] = (Math.random() - 0.5) * 400;
        positions1[i * 3 + 1] = (Math.random() - 0.5) * 400;
        positions1[i * 3 + 2] = (Math.random() - 0.5) * 400;

        const colorChoice = Math.random();
        if (colorChoice < 0.4) {
          colors1[i * 3] = 0.1;
          colors1[i * 3 + 1] = 0.6 + Math.random() * 0.4;
          colors1[i * 3 + 2] = 1;
        } else if (colorChoice < 0.7) {
          colors1[i * 3] = 0.5 + Math.random() * 0.5;
          colors1[i * 3 + 1] = 0.1;
          colors1[i * 3 + 2] = 1;
        } else {
          colors1[i * 3] = 1;
          colors1[i * 3 + 1] = 1;
          colors1[i * 3 + 2] = 1;
        }

        sizes1[i] = Math.random() * 3 + 1;
      }

      const geometry1 = new THREE.BufferGeometry();
      geometry1.setAttribute('position', new THREE.BufferAttribute(positions1, 3));
      geometry1.setAttribute('color', new THREE.BufferAttribute(colors1, 3));
      geometry1.setAttribute('size', new THREE.BufferAttribute(sizes1, 1));

      const material1 = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          pixelRatio: { value: renderer.getPixelRatio() },
        },
        vertexShader: `
          attribute float size;
          attribute vec3 color;
          varying vec3 vColor;
          varying float vAlpha;
          uniform float time;
          uniform float pixelRatio;

          void main() {
            vColor = color;
            vec3 pos = position;

            // Spiral motion
            float angle = time * 0.5 + length(position.xy) * 0.01;
            pos.x += sin(angle + position.z * 0.01) * 10.0;
            pos.y += cos(angle + position.z * 0.01) * 10.0;
            pos.z += sin(time * 0.3 + position.x * 0.01) * 5.0;

            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            float dist = length(mvPosition.xyz);
            vAlpha = smoothstep(300.0, 50.0, dist);
            gl_PointSize = size * pixelRatio * (200.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          varying float vAlpha;

          void main() {
            float dist = length(gl_PointCoord - vec2(0.5));
            if (dist > 0.5) discard;
            float alpha = (1.0 - smoothstep(0.0, 0.5, dist)) * vAlpha * 0.6;
            gl_FragColor = vec4(vColor * 1.5, alpha);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const particles1 = new THREE.Points(geometry1, material1);
      scene.add(particles1);

      // ============ PARTICLE SYSTEM 2: Ring particles ============
      const ringCount = 1500;
      const ringPositions = new Float32Array(ringCount * 3);
      const ringColors = new Float32Array(ringCount * 3);
      const ringSizes = new Float32Array(ringCount);

      for (let i = 0; i < ringCount; i++) {
        const ringRadius = 40 + Math.random() * 60;
        const theta = Math.random() * Math.PI * 2;
        ringPositions[i * 3] = ringRadius * Math.cos(theta);
        ringPositions[i * 3 + 1] = (Math.random() - 0.5) * 20;
        ringPositions[i * 3 + 2] = ringRadius * Math.sin(theta);

        ringColors[i * 3] = 0.3 + Math.random() * 0.7;
        ringColors[i * 3 + 1] = 0.8 + Math.random() * 0.2;
        ringColors[i * 3 + 2] = 1;

        ringSizes[i] = Math.random() * 2 + 0.5;
      }

      const ringGeometry = new THREE.BufferGeometry();
      ringGeometry.setAttribute('position', new THREE.BufferAttribute(ringPositions, 3));
      ringGeometry.setAttribute('color', new THREE.BufferAttribute(ringColors, 3));
      ringGeometry.setAttribute('size', new THREE.BufferAttribute(ringSizes, 1));

      const ringMaterial = new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 }, pixelRatio: { value: renderer.getPixelRatio() } },
        vertexShader: `
          attribute float size;
          attribute vec3 color;
          varying vec3 vColor;
          uniform float time;
          uniform float pixelRatio;

          void main() {
            vColor = color;
            vec3 pos = position;
            float angle = time * 0.8;
            float c = cos(angle);
            float s = sin(angle);
            pos.xz = mat2(c, -s, s, c) * pos.xz;
            pos.y += sin(time * 2.0 + position.x * 0.1) * 3.0;

            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_PointSize = size * pixelRatio * (150.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          void main() {
            float dist = length(gl_PointCoord - vec2(0.5));
            if (dist > 0.5) discard;
            float alpha = (1.0 - smoothstep(0.0, 0.5, dist)) * 0.8;
            gl_FragColor = vec4(vColor, alpha);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const ringParticles = new THREE.Points(ringGeometry, ringMaterial);
      scene.add(ringParticles);

      // ============ GEOMETRIC SHAPES: Wireframe icosahedrons ============
      const icoGeometry = new THREE.IcosahedronGeometry(35, 1);
      const icoMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        wireframe: true,
        transparent: true,
        opacity: 0.15,
      });
      const icosahedron = new THREE.Mesh(icoGeometry, icoMaterial);
      scene.add(icosahedron);

      const icoGeometry2 = new THREE.IcosahedronGeometry(50, 0);
      const icoMaterial2 = new THREE.MeshBasicMaterial({
        color: 0x8844ff,
        wireframe: true,
        transparent: true,
        opacity: 0.1,
      });
      const icosahedron2 = new THREE.Mesh(icoGeometry2, icoMaterial2);
      scene.add(icosahedron2);

      // ============ LIGHT BEAMS ============
      const beamCount = 8;
      const beams: THREE.Mesh[] = [];
      for (let i = 0; i < beamCount; i++) {
        const beamGeometry = new THREE.CylinderGeometry(0.5, 2, 200, 8);
        const beamMaterial = new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? 0x00ffff : 0x8844ff,
          transparent: true,
          opacity: 0.05,
        });
        const beam = new THREE.Mesh(beamGeometry, beamMaterial);
        beam.rotation.x = Math.PI / 2;
        beam.rotation.z = (i / beamCount) * Math.PI * 2;
        beam.position.z = -50;
        beams.push(beam);
        scene.add(beam);
      }

      // ============ ANIMATION LOOP ============
      let animationId: number;
      const clock = new THREE.Clock();

      const animate = () => {
        animationId = requestAnimationFrame(animate);
        const elapsedTime = clock.getElapsedTime();

        // Update shader uniforms
        material1.uniforms.time.value = elapsedTime;
        ringMaterial.uniforms.time.value = elapsedTime;

        // Rotate main particle system
        particles1.rotation.y = elapsedTime * 0.05;
        particles1.rotation.x = Math.sin(elapsedTime * 0.1) * 0.1;

        // Rotate geometric shapes
        icosahedron.rotation.x = elapsedTime * 0.2;
        icosahedron.rotation.y = elapsedTime * 0.3;
        icosahedron2.rotation.x = -elapsedTime * 0.15;
        icosahedron2.rotation.y = -elapsedTime * 0.2;

        // Animate beams
        beams.forEach((beam, i) => {
          beam.rotation.z = (i / beamCount) * Math.PI * 2 + elapsedTime * 0.2;
          (beam.material as THREE.MeshBasicMaterial).opacity = 0.03 + Math.sin(elapsedTime * 2 + i) * 0.02;
        });

        // Camera subtle movement
        camera.position.x = Math.sin(elapsedTime * 0.2) * 5;
        camera.position.y = Math.cos(elapsedTime * 0.15) * 3;
        camera.lookAt(0, 0, 0);

        renderer.render(scene, camera);
      };

      animate();

      // Handle resize
      const handleResize = () => {
        if (!container) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      };

      window.addEventListener('resize', handleResize);

      // Cleanup
      return () => {
        window.removeEventListener('resize', handleResize);
        cancelAnimationFrame(animationId);
        renderer.dispose();
        geometry1.dispose();
        material1.dispose();
        ringGeometry.dispose();
        ringMaterial.dispose();
        icoGeometry.dispose();
        icoMaterial.dispose();
        icoGeometry2.dispose();
        icoMaterial2.dispose();
        beams.forEach(beam => {
          beam.geometry.dispose();
          (beam.material as THREE.Material).dispose();
        });
        if (container && renderer.domElement) {
          container.removeChild(renderer.domElement);
        }
      };
    };

    const cleanup = initThree();
    return () => {
      cleanup.then((cleanupFn) => cleanupFn && cleanupFn());
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full bg-black relative overflow-hidden">
      {/* Three.js animated background */}
      <div ref={containerRef} className="absolute inset-0 z-0" />

      {/* Vignette overlay */}
      <div className="absolute inset-0 z-10 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at center, transparent 0%, transparent 40%, rgba(0,0,0,0.8) 100%)'
      }} />

      {/* Logo - static and prominent */}
      <div className="relative z-20">
        <img
          src="https://i.ibb.co/nsx4Njzz/CODELIVE1.png"
          alt="CodeLive"
          className="h-64 drop-shadow-2xl"
          style={{
            filter: 'drop-shadow(0 0 60px rgba(0, 200, 255, 0.4)) drop-shadow(0 0 120px rgba(136, 68, 255, 0.3))'
          }}
        />
      </div>
    </div>
  );
}

// ============ VIDEO SLIDE (MP4) ============
function VideoSlide({ url, label }: { url: string; label: string }) {
  return (
    <div className="flex flex-col h-full bg-black relative overflow-hidden">
      {/* Video container */}
      <div className="flex-1 relative">
        <video
          src={url}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-contain"
        />

        {/* Gradient overlay at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/80 to-transparent" />

        {/* Label */}
        <div className="absolute bottom-6 left-8 right-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-2xl font-semibold text-white">{label}</span>
          </div>
          <div className="px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-white/80">
            Video
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ YOUTUBE SLIDE ============
function YouTubeSlide({ url, label }: { url: string; label: string }) {
  // Extract video ID from various YouTube URL formats
  const getYouTubeId = (youtubeUrl: string) => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/, // Direct video ID
    ];
    for (const pattern of patterns) {
      const match = youtubeUrl.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const videoId = getYouTubeId(url);

  if (!videoId) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-zinc-900 via-black to-zinc-900">
        <p className="text-2xl text-red-400">Invalid YouTube URL</p>
        <p className="text-zinc-500 mt-2">{url}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-black relative overflow-hidden">
      {/* YouTube iframe */}
      <div className="flex-1 relative">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&showinfo=0&rel=0&modestbranding=1`}
          allow="autoplay; encrypted-media"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
          style={{ border: 'none' }}
        />

        {/* Gradient overlay at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

        {/* Label */}
        <div className="absolute bottom-6 left-8 right-8 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-4">
            <svg className="w-8 h-8 text-red-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
            <span className="text-2xl font-semibold text-white">{label}</span>
          </div>
          <div className="px-4 py-2 bg-red-500/20 backdrop-blur-sm rounded-full text-red-400 border border-red-500/30">
            YouTube
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ RECENT ISSUES SLIDE ============
function RecentIssuesSlide({ projects }: { projects: Project[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const projectsWithGithub = projects.filter(p => p.githubUrl).slice(0, 10);

  // Parse GitHub URLs to get owner/repo info
  const repos = projectsWithGithub
    .map((project) => {
      const match = project.githubUrl?.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) return null;
      return {
        owner: match[1],
        repo: match[2].replace('.git', ''),
        projectTitle: project.title,
      };
    })
    .filter((r): r is { owner: string; repo: string; projectTitle: string } => r !== null);

  // Fetch issues from backend API (authenticated, works with private repos)
  const { data: allIssues, isLoading } = useQuery({
    queryKey: ['all-github-issues-bulk', repos],
    queryFn: async () => {
      const res = await api.post<any[]>('/api/github/issues/bulk', { repos, state: 'open', perPage: 10 });
      return res.slice(0, 15);
    },
    staleTime: 60000,
    enabled: repos.length > 0,
  });

  // Cycle through issues one at a time
  useEffect(() => {
    if (!allIssues || allIssues.length === 0) return;

    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % allIssues.length);
        setIsTransitioning(false);
      }, 500);
    }, 6000); // Show each issue for 6 seconds

    return () => clearInterval(interval);
  }, [allIssues?.length]);

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const currentIssue = allIssues?.[currentIndex];

  // Get priority color based on labels
  const getPriorityInfo = (labels: any[]) => {
    if (!labels) return null;
    const priorityLabel = labels.find(l =>
      l.name.toLowerCase().includes('priority') ||
      l.name.toLowerCase().includes('urgent') ||
      l.name.toLowerCase().includes('critical') ||
      l.name.toLowerCase().includes('high')
    );
    if (priorityLabel?.name.toLowerCase().includes('critical') || priorityLabel?.name.toLowerCase().includes('urgent')) {
      return { text: 'Critical', color: 'red' };
    }
    if (priorityLabel?.name.toLowerCase().includes('high')) {
      return { text: 'High Priority', color: 'orange' };
    }
    return null;
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-emerald-950/20 via-black to-zinc-900 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-emerald-600/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '0.75s' }} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-10 py-6 relative z-10">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <Github className="w-8 h-8 text-white" />
          </div>
          <div>
            <h2 className="text-4xl font-bold text-white">GitHub Issues</h2>
            <p className="text-emerald-400/80 text-lg">Open Issues Feed</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-zinc-400 text-lg">Live Feed</span>
        </div>
      </div>

      {/* Single Issue Display */}
      <div className="flex-1 px-12 pb-8 overflow-hidden relative z-10 flex items-center justify-center">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-6">
            <Loader2 className="h-20 w-20 text-emerald-500 animate-spin" />
            <p className="text-2xl text-zinc-500">Fetching open issues...</p>
          </div>
        ) : currentIssue ? (
          <div className={`w-full max-w-5xl transition-all duration-500 ${isTransitioning ? 'opacity-0 scale-95 translate-y-4' : 'opacity-100 scale-100 translate-y-0'}`}>
            {/* Main Issue Card */}
            <div className="bg-zinc-900/80 backdrop-blur-xl rounded-3xl border border-zinc-700/50 p-10 shadow-2xl">
              {/* Top Bar */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <span className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white flex items-center justify-center font-black text-3xl shadow-xl shadow-emerald-500/40">
                    {currentIndex + 1}
                  </span>
                  <div>
                    <p className="text-zinc-500 text-lg">Issue #{currentIndex + 1} of {allIssues?.length || 0}</p>
                    <p className="text-emerald-400 font-semibold text-xl">{formatRelativeTime(currentIssue.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-3 bg-emerald-500/20 px-5 py-3 rounded-2xl border border-emerald-500/30">
                    <CircleDot className="w-6 h-6 text-emerald-400" />
                    <span className="text-2xl font-bold text-emerald-400">#{currentIssue.number}</span>
                  </div>
                  {currentIssue.state === 'open' ? (
                    <div className="flex items-center gap-2 bg-emerald-500/20 px-4 py-2 rounded-xl border border-emerald-500/30">
                      <div className="w-3 h-3 rounded-full bg-emerald-500" />
                      <span className="text-emerald-400 font-semibold">Open</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-purple-500/20 px-4 py-2 rounded-xl border border-purple-500/30">
                      <div className="w-3 h-3 rounded-full bg-purple-500" />
                      <span className="text-purple-400 font-semibold">Closed</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Title */}
              <h2 className="text-5xl font-bold text-white leading-tight mb-4">
                {currentIssue.title}
              </h2>

              {/* Body Preview */}
              {currentIssue.body && (
                <div className="mb-6 p-5 bg-zinc-800/40 rounded-2xl border border-zinc-700/30">
                  <p className="text-xl text-zinc-300 leading-relaxed line-clamp-3">
                    {currentIssue.body
                      .replace(/```[\s\S]*?```/g, '[code block]')
                      .replace(/`[^`]+`/g, (match: string) => match.slice(1, -1))
                      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
                      .replace(/[#*_~]/g, '')
                      .replace(/!\[[^\]]*\]\([^)]+\)/g, '[image]')
                      .replace(/\n+/g, ' ')
                      .trim()
                      .slice(0, 300)}
                    {currentIssue.body.length > 300 ? '...' : ''}
                  </p>
                </div>
              )}

              {/* Repo & Author */}
              <div className="flex items-center gap-8 mb-8">
                <div className="flex items-center gap-3 bg-zinc-800/60 px-5 py-3 rounded-xl">
                  <Github className="w-6 h-6 text-emerald-400" />
                  <span className="text-xl text-emerald-300 font-medium">{currentIssue.repoName}</span>
                </div>
                {currentIssue.projectTitle && (
                  <div className="flex items-center gap-3 bg-zinc-800/60 px-5 py-3 rounded-xl">
                    <Rocket className="w-5 h-5 text-blue-400" />
                    <span className="text-xl text-blue-300 font-medium">{currentIssue.projectTitle}</span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  {currentIssue.user?.avatar_url ? (
                    <img src={currentIssue.user.avatar_url} alt={currentIssue.user.login} className="w-12 h-12 rounded-full border-2 border-emerald-500/30" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
                      <User className="w-6 h-6 text-white" />
                    </div>
                  )}
                  <div>
                    <p className="text-zinc-500 text-sm">Opened by</p>
                    <p className="text-xl font-semibold text-white">{currentIssue.user?.login || 'Unknown'}</p>
                  </div>
                </div>
              </div>

              {/* Labels / Badges */}
              <div className="flex items-center gap-4 flex-wrap">
                {getPriorityInfo(currentIssue.labels) && (
                  <span className={`px-4 py-2 text-lg font-semibold rounded-full animate-pulse ${
                    getPriorityInfo(currentIssue.labels)?.color === 'red'
                      ? 'bg-gradient-to-r from-red-500 to-red-600 text-white'
                      : 'bg-gradient-to-r from-orange-500 to-orange-600 text-white'
                  }`}>
                    {getPriorityInfo(currentIssue.labels)?.text}
                  </span>
                )}
                {currentIssue.labels && currentIssue.labels.length > 0 && (
                  currentIssue.labels.slice(0, 5).map((label: any) => (
                    <span
                      key={label.name}
                      className="px-4 py-2 text-lg font-medium rounded-full border"
                      style={{
                        backgroundColor: `#${label.color}20`,
                        color: `#${label.color}`,
                        borderColor: `#${label.color}50`
                      }}
                    >
                      {label.name}
                    </span>
                  ))
                )}
                {currentIssue.assignees && currentIssue.assignees.length > 0 && (
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-zinc-500 text-sm mr-2">Assigned to:</span>
                    <div className="flex -space-x-2">
                      {currentIssue.assignees.slice(0, 3).map((assignee: any) => (
                        <img
                          key={assignee.login}
                          src={assignee.avatar_url}
                          alt={assignee.login}
                          title={assignee.login}
                          className="w-10 h-10 rounded-full border-2 border-zinc-900"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Progress Dots */}
            <div className="flex items-center justify-center gap-2 mt-8">
              {allIssues?.slice(0, 15).map((_, idx) => (
                <div
                  key={idx}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    idx === currentIndex
                      ? 'w-8 bg-emerald-500'
                      : 'w-2 bg-zinc-700 hover:bg-zinc-600'
                  }`}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4">
            <CircleDot className="h-20 w-20 text-zinc-700" />
            <p className="text-2xl text-zinc-600">No open issues found</p>
          </div>
        )}
      </div>

      {/* Bottom Bar - Next Up Preview */}
      {allIssues && allIssues.length > 0 && (
        <div className="relative z-10 border-t border-zinc-800/50 bg-black/50 backdrop-blur-sm">
          <div className="flex items-center gap-8 px-12 py-4">
            <span className="text-emerald-500 font-bold text-lg whitespace-nowrap flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              NEXT UP
            </span>
            <div className="flex-1 flex items-center gap-6 overflow-hidden">
              {allIssues.slice(currentIndex + 1, currentIndex + 4).concat(allIssues.slice(0, Math.max(0, 3 - (allIssues.length - currentIndex - 1)))).slice(0, 3).map((issue: any, idx: number) => (
                <div key={issue.id} className="flex items-center gap-3 opacity-60">
                  <span className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-sm font-bold text-zinc-400">
                    {((currentIndex + 1 + idx) % allIssues.length) + 1}
                  </span>
                  <span className="text-zinc-400 truncate max-w-xs">{issue.title}</span>
                  <span className="text-emerald-500/60 text-sm whitespace-nowrap">#{issue.number}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ RECENT COMMITS SLIDE ============
function RecentCommitsSlide({ projects }: { projects: Project[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const projectsWithGithub = projects.filter(p => p.githubUrl).slice(0, 10);

  // Fetch commits from all projects with GitHub URLs
  const { data: allCommits, isLoading } = useQuery({
    queryKey: ['all-github-commits', projectsWithGithub.map(p => p.githubUrl)],
    queryFn: async () => {
      const commitPromises = projectsWithGithub.map(async (project) => {
        const match = project.githubUrl?.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (!match) return [];
        try {
          const res = await fetch(`https://api.github.com/repos/${match[1]}/${match[2].replace('.git', '')}/commits?per_page=5`);
          if (!res.ok) return [];
          const commits = await res.json();
          return commits.map((commit: any) => ({ ...commit, projectTitle: project.title, repoName: `${match[1]}/${match[2].replace('.git', '')}` }));
        } catch {
          return [];
        }
      });
      const results = await Promise.all(commitPromises);
      return results.flat().sort((a: any, b: any) => new Date(b.commit.author.date).getTime() - new Date(a.commit.author.date).getTime()).slice(0, 15);
    },
    staleTime: 60000,
    enabled: projectsWithGithub.length > 0,
  });

  // Cycle through commits one at a time
  useEffect(() => {
    if (!allCommits || allCommits.length === 0) return;

    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % allCommits.length);
        setIsTransitioning(false);
      }, 500);
    }, 6000); // Show each commit for 6 seconds

    return () => clearInterval(interval);
  }, [allCommits?.length]);

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const currentCommit = allCommits?.[currentIndex];

  // Get commit type from message
  const getCommitType = (message: string) => {
    const lowerMsg = message.toLowerCase();
    if (lowerMsg.startsWith('fix') || lowerMsg.includes('bug')) return { text: 'Bug Fix', color: 'red', icon: '🐛' };
    if (lowerMsg.startsWith('feat') || lowerMsg.includes('add')) return { text: 'Feature', color: 'green', icon: '✨' };
    if (lowerMsg.startsWith('refactor')) return { text: 'Refactor', color: 'purple', icon: '♻️' };
    if (lowerMsg.startsWith('docs')) return { text: 'Docs', color: 'blue', icon: '📚' };
    if (lowerMsg.startsWith('test')) return { text: 'Tests', color: 'yellow', icon: '🧪' };
    if (lowerMsg.startsWith('chore') || lowerMsg.startsWith('build')) return { text: 'Chore', color: 'zinc', icon: '🔧' };
    if (lowerMsg.startsWith('style')) return { text: 'Style', color: 'pink', icon: '💅' };
    if (lowerMsg.startsWith('perf')) return { text: 'Performance', color: 'orange', icon: '⚡' };
    return null;
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-blue-950/20 via-black to-zinc-900 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-purple-600/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '0.75s' }} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-10 py-6 relative z-10">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/30">
            <GitCommit className="w-8 h-8 text-white" />
          </div>
          <div>
            <h2 className="text-4xl font-bold text-white">Recent Commits</h2>
            <p className="text-blue-400/80 text-lg">Latest Code Changes</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-zinc-400 text-lg">Live Feed</span>
        </div>
      </div>

      {/* Single Commit Display */}
      <div className="flex-1 px-12 pb-8 overflow-hidden relative z-10 flex items-center justify-center">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-6">
            <Loader2 className="h-20 w-20 text-blue-500 animate-spin" />
            <p className="text-2xl text-zinc-500">Fetching recent commits...</p>
          </div>
        ) : currentCommit ? (
          <div className={`w-full max-w-5xl transition-all duration-500 ${isTransitioning ? 'opacity-0 scale-95 translate-y-4' : 'opacity-100 scale-100 translate-y-0'}`}>
            {/* Main Commit Card */}
            <div className="bg-zinc-900/80 backdrop-blur-xl rounded-3xl border border-zinc-700/50 p-10 shadow-2xl">
              {/* Top Bar */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <span className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center font-black text-3xl shadow-xl shadow-blue-500/40">
                    {currentIndex + 1}
                  </span>
                  <div>
                    <p className="text-zinc-500 text-lg">Commit #{currentIndex + 1} of {allCommits?.length || 0}</p>
                    <p className="text-blue-400 font-semibold text-xl">{formatRelativeTime(currentCommit.commit.author.date)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-3 bg-blue-500/20 px-5 py-3 rounded-2xl border border-blue-500/30">
                    <GitCommit className="w-6 h-6 text-blue-400" />
                    <span className="text-2xl font-mono font-bold text-blue-400">{currentCommit.sha.substring(0, 7)}</span>
                  </div>
                  {getCommitType(currentCommit.commit.message) && (
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${
                      getCommitType(currentCommit.commit.message)?.color === 'red' ? 'bg-red-500/20 border-red-500/30' :
                      getCommitType(currentCommit.commit.message)?.color === 'green' ? 'bg-emerald-500/20 border-emerald-500/30' :
                      getCommitType(currentCommit.commit.message)?.color === 'purple' ? 'bg-purple-500/20 border-purple-500/30' :
                      getCommitType(currentCommit.commit.message)?.color === 'blue' ? 'bg-blue-500/20 border-blue-500/30' :
                      getCommitType(currentCommit.commit.message)?.color === 'yellow' ? 'bg-yellow-500/20 border-yellow-500/30' :
                      getCommitType(currentCommit.commit.message)?.color === 'orange' ? 'bg-orange-500/20 border-orange-500/30' :
                      getCommitType(currentCommit.commit.message)?.color === 'pink' ? 'bg-pink-500/20 border-pink-500/30' :
                      'bg-zinc-500/20 border-zinc-500/30'
                    }`}>
                      <span className="text-xl">{getCommitType(currentCommit.commit.message)?.icon}</span>
                      <span className={`font-semibold ${
                        getCommitType(currentCommit.commit.message)?.color === 'red' ? 'text-red-400' :
                        getCommitType(currentCommit.commit.message)?.color === 'green' ? 'text-emerald-400' :
                        getCommitType(currentCommit.commit.message)?.color === 'purple' ? 'text-purple-400' :
                        getCommitType(currentCommit.commit.message)?.color === 'blue' ? 'text-blue-400' :
                        getCommitType(currentCommit.commit.message)?.color === 'yellow' ? 'text-yellow-400' :
                        getCommitType(currentCommit.commit.message)?.color === 'orange' ? 'text-orange-400' :
                        getCommitType(currentCommit.commit.message)?.color === 'pink' ? 'text-pink-400' :
                        'text-zinc-400'
                      }`}>{getCommitType(currentCommit.commit.message)?.text}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Commit Message (Title) */}
              <h2 className="text-5xl font-bold text-white leading-tight mb-4">
                {currentCommit.commit.message.split('\n')[0]}
              </h2>

              {/* Commit Body (if exists) */}
              {currentCommit.commit.message.includes('\n') && currentCommit.commit.message.split('\n').slice(1).join('\n').trim() && (
                <div className="mb-6 p-5 bg-zinc-800/40 rounded-2xl border border-zinc-700/30">
                  <p className="text-xl text-zinc-300 leading-relaxed line-clamp-3 whitespace-pre-wrap">
                    {currentCommit.commit.message.split('\n').slice(1).join('\n').trim().slice(0, 300)}
                    {currentCommit.commit.message.split('\n').slice(1).join('\n').trim().length > 300 ? '...' : ''}
                  </p>
                </div>
              )}

              {/* Repo & Author */}
              <div className="flex items-center gap-8 mb-8">
                <div className="flex items-center gap-3 bg-zinc-800/60 px-5 py-3 rounded-xl">
                  <Github className="w-6 h-6 text-blue-400" />
                  <span className="text-xl text-blue-300 font-medium">{currentCommit.repoName}</span>
                </div>
                {currentCommit.projectTitle && (
                  <div className="flex items-center gap-3 bg-zinc-800/60 px-5 py-3 rounded-xl">
                    <Rocket className="w-5 h-5 text-purple-400" />
                    <span className="text-xl text-purple-300 font-medium">{currentCommit.projectTitle}</span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  {currentCommit.author?.avatar_url ? (
                    <img src={currentCommit.author.avatar_url} alt={currentCommit.author.login} className="w-12 h-12 rounded-full border-2 border-blue-500/30" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                      <User className="w-6 h-6 text-white" />
                    </div>
                  )}
                  <div>
                    <p className="text-zinc-500 text-sm">Committed by</p>
                    <p className="text-xl font-semibold text-white">{currentCommit.author?.login || currentCommit.commit.author.name}</p>
                  </div>
                </div>
              </div>

              {/* Stats & Info */}
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2 bg-zinc-800/60 px-4 py-2 rounded-xl">
                  <Calendar className="w-5 h-5 text-zinc-400" />
                  <span className="text-zinc-300">{formatDateTime(currentCommit.commit.author.date)}</span>
                </div>
                {currentCommit.stats && (
                  <>
                    <div className="flex items-center gap-2 bg-emerald-500/20 px-4 py-2 rounded-xl border border-emerald-500/30">
                      <span className="text-emerald-400 font-bold">+{currentCommit.stats.additions}</span>
                    </div>
                    <div className="flex items-center gap-2 bg-red-500/20 px-4 py-2 rounded-xl border border-red-500/30">
                      <span className="text-red-400 font-bold">-{currentCommit.stats.deletions}</span>
                    </div>
                  </>
                )}
                {currentCommit.commit.verification?.verified && (
                  <div className="flex items-center gap-2 bg-emerald-500/20 px-4 py-2 rounded-xl border border-emerald-500/30">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <span className="text-emerald-400 font-semibold">Verified</span>
                  </div>
                )}
              </div>
            </div>

            {/* Progress Dots */}
            <div className="flex items-center justify-center gap-2 mt-8">
              {allCommits?.slice(0, 15).map((_, idx) => (
                <div
                  key={idx}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    idx === currentIndex
                      ? 'w-8 bg-blue-500'
                      : 'w-2 bg-zinc-700 hover:bg-zinc-600'
                  }`}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4">
            <GitCommit className="h-20 w-20 text-zinc-700" />
            <p className="text-2xl text-zinc-600">No commits found</p>
          </div>
        )}
      </div>

      {/* Bottom Bar - Next Up Preview */}
      {allCommits && allCommits.length > 0 && (
        <div className="relative z-10 border-t border-zinc-800/50 bg-black/50 backdrop-blur-sm">
          <div className="flex items-center gap-8 px-12 py-4">
            <span className="text-blue-500 font-bold text-lg whitespace-nowrap flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              NEXT UP
            </span>
            <div className="flex-1 flex items-center gap-6 overflow-hidden">
              {allCommits.slice(currentIndex + 1, currentIndex + 4).concat(allCommits.slice(0, Math.max(0, 3 - (allCommits.length - currentIndex - 1)))).slice(0, 3).map((commit: any, idx: number) => (
                <div key={commit.sha} className="flex items-center gap-3 opacity-60">
                  <span className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-sm font-bold text-zinc-400">
                    {((currentIndex + 1 + idx) % allCommits.length) + 1}
                  </span>
                  <span className="text-zinc-400 truncate max-w-xs">{commit.commit.message.split('\n')[0]}</span>
                  <span className="text-blue-500/60 text-sm font-mono whitespace-nowrap">{commit.sha.substring(0, 7)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ HACKER NEWS SLIDE ============
interface HackerNewsItem {
  id: number;
  title: string;
  url?: string;
  by: string;
  time: number;
  score: number;
  descendants?: number;
  type: string;
}

function HackerNewsSlide() {
  const [stories, setStories] = useState<HackerNewsItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Fetch all stories once
  useEffect(() => {
    const fetchStories = async () => {
      setIsLoading(true);
      try {
        const idsRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
        const ids = await idsRes.json();

        const storyPromises = ids.slice(0, 15).map(async (id: number) => {
          const res = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
          return res.json();
        });

        const fetchedStories = await Promise.all(storyPromises);
        setStories(fetchedStories.filter(Boolean));
      } catch (error) {
        console.error('Failed to fetch HN stories:', error);
      }
      setIsLoading(false);
    };

    fetchStories();
    const refreshInterval = setInterval(fetchStories, 300000);
    return () => clearInterval(refreshInterval);
  }, []);

  // Cycle through stories one at a time
  useEffect(() => {
    if (stories.length === 0) return;

    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % stories.length);
        setIsTransitioning(false);
      }, 500);
    }, 6000); // Show each story for 6 seconds

    return () => clearInterval(interval);
  }, [stories.length]);

  const currentStory = stories[currentIndex];

  const formatTimeAgo = (timestamp: number) => {
    const now = Date.now() / 1000;
    const diff = now - timestamp;
    const hours = Math.floor(diff / 3600);
    const days = Math.floor(diff / 86400);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'just now';
  };

  const getDomain = (url?: string) => {
    if (!url) return 'news.ycombinator.com';
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return '';
    }
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-orange-950/20 via-black to-zinc-900 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-orange-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-orange-600/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-orange-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '0.75s' }} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-10 py-6 relative z-10">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 bg-orange-500 rounded-lg flex items-center justify-center shadow-lg shadow-orange-500/30">
            <span className="text-2xl font-bold text-white">Y</span>
          </div>
          <div>
            <h2 className="text-4xl font-bold text-white">Hacker News</h2>
            <p className="text-orange-400/80 text-lg">Top Stories</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-orange-500 animate-pulse" />
          <span className="text-zinc-400 text-lg">Live Feed</span>
        </div>
      </div>

      {/* Single Story Display */}
      <div className="flex-1 px-12 pb-8 overflow-hidden relative z-10 flex items-center justify-center">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-6">
            <Loader2 className="h-20 w-20 text-orange-500 animate-spin" />
            <p className="text-2xl text-zinc-500">Fetching top stories...</p>
          </div>
        ) : currentStory ? (
          <div className={`w-full max-w-5xl transition-all duration-500 ${isTransitioning ? 'opacity-0 scale-95 translate-y-4' : 'opacity-100 scale-100 translate-y-0'}`}>
            {/* Main Story Card */}
            <div className="bg-zinc-900/80 backdrop-blur-xl rounded-3xl border border-zinc-700/50 p-10 shadow-2xl">
              {/* Top Bar */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <span className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 text-white flex items-center justify-center font-black text-3xl shadow-xl shadow-orange-500/40">
                    {currentIndex + 1}
                  </span>
                  <div>
                    <p className="text-zinc-500 text-lg">Story #{currentIndex + 1} of {stories.length}</p>
                    <p className="text-orange-400 font-semibold text-xl">{formatTimeAgo(currentStory.time)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-3 bg-orange-500/20 px-5 py-3 rounded-2xl border border-orange-500/30">
                    <svg className="w-7 h-7 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                    </svg>
                    <span className="text-3xl font-bold text-orange-400">{currentStory.score}</span>
                    <span className="text-orange-400/70">points</span>
                  </div>
                  <div className="flex items-center gap-3 bg-zinc-800/80 px-5 py-3 rounded-2xl">
                    <MessageSquare className="w-6 h-6 text-zinc-400" />
                    <span className="text-2xl font-bold text-white">{currentStory.descendants || 0}</span>
                    <span className="text-zinc-500">comments</span>
                  </div>
                </div>
              </div>

              {/* Title */}
              <h2 className="text-5xl font-bold text-white leading-tight mb-6">
                {currentStory.title}
              </h2>

              {/* Source & Author */}
              <div className="flex items-center gap-8 mb-8">
                {currentStory.url && (
                  <div className="flex items-center gap-3 bg-zinc-800/60 px-5 py-3 rounded-xl">
                    <Globe className="w-6 h-6 text-orange-400" />
                    <span className="text-xl text-orange-300 font-medium">{getDomain(currentStory.url)}</span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
                    <User className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-zinc-500 text-sm">Posted by</p>
                    <p className="text-xl font-semibold text-white">{currentStory.by}</p>
                  </div>
                </div>
              </div>

              {/* Tags / Badges */}
              <div className="flex items-center gap-4">
                {currentStory.score > 200 && (
                  <span className="px-4 py-2 text-lg font-semibold rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white animate-pulse">
                    🔥 Trending
                  </span>
                )}
                {currentStory.descendants && currentStory.descendants > 100 && (
                  <span className="px-4 py-2 text-lg font-semibold rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    💬 Hot Discussion
                  </span>
                )}
                {currentStory.type === 'job' && (
                  <span className="px-4 py-2 text-lg font-semibold rounded-full bg-green-500/20 text-green-300 border border-green-500/30">
                    💼 Job Posting
                  </span>
                )}
                <span className="px-4 py-2 text-lg font-medium rounded-full bg-zinc-800 text-zinc-400">
                  {currentStory.type === 'story' ? '📰 Story' : currentStory.type}
                </span>
              </div>
            </div>

            {/* Progress Dots */}
            <div className="flex items-center justify-center gap-2 mt-8">
              {stories.slice(0, 15).map((_, idx) => (
                <div
                  key={idx}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    idx === currentIndex
                      ? 'w-8 bg-orange-500'
                      : 'w-2 bg-zinc-700 hover:bg-zinc-600'
                  }`}
                />
              ))}
            </div>
          </div>
        ) : (
          <p className="text-2xl text-zinc-600">No stories available</p>
        )}
      </div>

      {/* Bottom Bar - Next Up Preview */}
      {stories.length > 0 && (
        <div className="relative z-10 border-t border-zinc-800/50 bg-black/50 backdrop-blur-sm">
          <div className="flex items-center gap-8 px-12 py-4">
            <span className="text-orange-500 font-bold text-lg whitespace-nowrap flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              NEXT UP
            </span>
            <div className="flex-1 flex items-center gap-6 overflow-hidden">
              {stories.slice(currentIndex + 1, currentIndex + 4).concat(stories.slice(0, Math.max(0, 3 - (stories.length - currentIndex - 1)))).slice(0, 3).map((story, idx) => (
                <div key={story.id} className="flex items-center gap-3 opacity-60">
                  <span className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-sm font-bold text-zinc-400">
                    {((currentIndex + 1 + idx) % stories.length) + 1}
                  </span>
                  <span className="text-zinc-400 truncate max-w-xs">{story.title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CSS for animations */}
      <style jsx>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
        @keyframes slide-in {
          0% {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-slide-in {
          animation: slide-in 0.4s ease-out forwards;
        }
        @keyframes pulse-subtle {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
        .animate-pulse-subtle {
          animation: pulse-subtle 3s ease-in-out infinite;
        }
        @keyframes bounce-subtle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        .animate-bounce-subtle {
          animation: bounce-subtle 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

// ============ REDDIT SLIDE ============
interface RedditPostItem {
  id: string;
  title: string;
  author: string;
  subreddit: string;
  url: string;
  permalink: string;
  thumbnail: string | null;
  preview: string | null;
  selftext: string;
  score: number;
  numComments: number;
  createdAt: string;
  flair: string | null;
  isImage?: boolean;
}

// Helper to get the best image URL from a post
function getPostImage(post: RedditPostItem): string | null {
  // Priority: preview > direct image URL > thumbnail
  if (post.preview) return post.preview;
  if (post.isImage && post.url && /\.(jpg|jpeg|png|gif|webp)$/i.test(post.url)) return post.url;
  if (post.thumbnail && !['self', 'default', 'nsfw', 'spoiler', ''].includes(post.thumbnail)) return post.thumbnail;
  return null;
}

const SUBREDDIT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  news: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
  technology: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  worldnews: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
  science: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' },
  business: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
  stocks: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  realestate: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
  programming: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' },
};

function getSubredditColor(subreddit: string) {
  return SUBREDDIT_COLORS[subreddit.toLowerCase()] || { bg: 'bg-zinc-500/20', text: 'text-zinc-400', border: 'border-zinc-500/30' };
}

function RedditSlide({ subreddits = DEFAULT_SUBREDDITS }: { subreddits?: string[] }) {
  const [posts, setPosts] = useState<RedditPostItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Fetch posts from our backend
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPosts = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          subreddits: subreddits.join(','),
          sort: 'hot',
          limit: '10',
          totalLimit: '30',
        });

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const res = await fetch(`${apiUrl}/api/reddit/feed?${params.toString()}`);
        const data = await res.json();

        // Handle nested response structure: { success: true, data: { posts: [...] } }
        const postsArray = data?.data?.posts || data?.posts || [];
        if (Array.isArray(postsArray) && postsArray.length > 0) {
          setPosts(postsArray);
        } else {
          setError('No posts returned from Reddit API');
        }
      } catch (err) {
        console.error('Failed to fetch Reddit posts:', err);
        setError(err instanceof Error ? err.message : 'Failed to connect to backend');
      }
      setIsLoading(false);
    };

    fetchPosts();
    const refreshInterval = setInterval(fetchPosts, 300000); // Refresh every 5 minutes
    return () => clearInterval(refreshInterval);
  }, [subreddits]);

  // Cycle through posts one at a time
  useEffect(() => {
    if (posts.length === 0) return;

    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % posts.length);
        setIsTransitioning(false);
      }, 500);
    }, 8000); // Show each post for 8 seconds

    return () => clearInterval(interval);
  }, [posts.length]);

  const currentPost = posts[currentIndex];

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const formatScore = (score: number) => {
    if (score >= 1000000) return `${(score / 1000000).toFixed(1)}M`;
    if (score >= 1000) return `${(score / 1000).toFixed(1)}k`;
    return score.toString();
  };

  const colors = currentPost ? getSubredditColor(currentPost.subreddit) : getSubredditColor('');

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-orange-950/20 via-black to-zinc-900 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-orange-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-red-600/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-orange-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '0.75s' }} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-10 py-6 relative z-10">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center shadow-lg shadow-orange-500/30">
            <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
            </svg>
          </div>
          <div>
            <h2 className="text-4xl font-bold text-white">Reddit</h2>
            <p className="text-orange-400/80 text-lg">Trending Posts</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-orange-500 animate-pulse" />
          <span className="text-zinc-400 text-lg">Live Feed</span>
        </div>
      </div>

      {/* Single Post Display */}
      <div className="flex-1 px-12 pb-8 overflow-hidden relative z-10 flex items-center justify-center">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-6">
            <Loader2 className="h-20 w-20 text-orange-500 animate-spin" />
            <p className="text-2xl text-zinc-500">Loading Reddit feed...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-6 text-center">
            <div className="w-24 h-24 bg-red-500/20 rounded-full flex items-center justify-center">
              <AlertTriangle className="h-12 w-12 text-red-400" />
            </div>
            <div>
              <p className="text-2xl text-white mb-2">Failed to load Reddit feed</p>
              <p className="text-lg text-zinc-500 max-w-md">{error}</p>
              <p className="text-sm text-zinc-600 mt-4">Make sure the backend is running on port 3001</p>
            </div>
          </div>
        ) : currentPost ? (
          <div className={`w-full h-full flex transition-all duration-700 ${isTransitioning ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
            {/* Left Side - Image */}
            {(currentPost.preview || currentPost.thumbnail) && (
              <div className="w-1/2 h-full relative overflow-hidden">
                <img
                  src={currentPost.preview || currentPost.thumbnail || ''}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/800x600/1a1a1a/333?text=No+Image'; }}
                />
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/90" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />

                {/* Score badge on image */}
                <div className="absolute top-6 left-6 flex items-center gap-3 bg-black/60 backdrop-blur-md px-5 py-3 rounded-2xl border border-orange-500/30">
                  <svg className="w-8 h-8 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                  </svg>
                  <span className="text-4xl font-black text-orange-400">{formatScore(currentPost.score)}</span>
                </div>

                {/* Hot badge */}
                {currentPost.score > 5000 && (
                  <div className="absolute top-6 right-6 px-5 py-3 text-xl font-bold rounded-2xl bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg shadow-orange-500/30 animate-pulse">
                    🔥 TRENDING
                  </div>
                )}
              </div>
            )}

            {/* Right Side - Content */}
            <div className={`${(currentPost.preview || currentPost.thumbnail) ? 'w-1/2' : 'w-full'} h-full flex flex-col justify-center p-12`}>
              {/* Subreddit & Time */}
              <div className="flex items-center gap-4 mb-6">
                <span className={`px-6 py-3 rounded-2xl ${colors.bg} ${colors.text} border-2 ${colors.border} font-bold text-2xl`}>
                  r/{currentPost.subreddit}
                </span>
                <span className="text-zinc-500 text-xl">•</span>
                <span className="text-orange-400 font-semibold text-xl">{formatTimeAgo(currentPost.createdAt)}</span>
                {currentPost.flair && (
                  <>
                    <span className="text-zinc-500 text-xl">•</span>
                    <span className="px-4 py-2 text-lg font-medium rounded-full bg-zinc-800/80 text-zinc-300 border border-zinc-700">
                      {currentPost.flair}
                    </span>
                  </>
                )}
              </div>

              {/* Title */}
              <h2 className="text-5xl font-black text-white leading-tight mb-8 line-clamp-4">
                {currentPost.title}
              </h2>

              {/* Self text preview (only if no image) */}
              {currentPost.selftext && !(currentPost.preview || currentPost.thumbnail) && (
                <p className="text-2xl text-zinc-400 mb-8 line-clamp-4 leading-relaxed">{currentPost.selftext}</p>
              )}

              {/* Stats Row */}
              <div className="flex items-center gap-6 mb-8">
                {!(currentPost.preview || currentPost.thumbnail) && (
                  <div className="flex items-center gap-3 bg-orange-500/20 px-6 py-4 rounded-2xl border border-orange-500/30">
                    <svg className="w-8 h-8 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                    </svg>
                    <span className="text-4xl font-black text-orange-400">{formatScore(currentPost.score)}</span>
                  </div>
                )}
                <div className="flex items-center gap-3 bg-zinc-800/80 px-6 py-4 rounded-2xl border border-zinc-700/50">
                  <MessageSquare className="w-7 h-7 text-blue-400" />
                  <span className="text-3xl font-bold text-white">{currentPost.numComments}</span>
                  <span className="text-zinc-500 text-lg">comments</span>
                </div>
              </div>

              {/* Author */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-400 via-red-500 to-purple-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
                  <User className="w-7 h-7 text-white" />
                </div>
                <div>
                  <p className="text-zinc-500 text-sm uppercase tracking-wider">Posted by</p>
                  <p className="text-2xl font-bold text-white">u/{currentPost.author}</p>
                </div>
              </div>

              {/* Progress indicator */}
              <div className="mt-auto pt-8">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-zinc-600 text-sm uppercase tracking-wider">Post {currentIndex + 1} of {posts.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  {posts.slice(0, 12).map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-1.5 rounded-full transition-all duration-500 ${
                        idx === currentIndex
                          ? 'w-12 bg-gradient-to-r from-orange-500 to-red-500'
                          : idx < currentIndex
                          ? 'w-6 bg-orange-500/30'
                          : 'w-6 bg-zinc-800'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-2xl text-zinc-600">No posts available</p>
        )}
      </div>

      {/* Bottom Bar - Next Up Preview with Thumbnails */}
      {posts.length > 1 && !isLoading && (
        <div className="relative z-10 border-t border-orange-500/20 bg-gradient-to-r from-black via-zinc-900/90 to-black backdrop-blur-md">
          <div className="flex items-center gap-6 px-8 py-3">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-orange-500 animate-pulse" />
              <span className="text-orange-400 font-bold text-sm uppercase tracking-widest">Coming Up</span>
            </div>
            <div className="flex-1 flex items-center gap-4 overflow-hidden">
              {posts.slice(currentIndex + 1, currentIndex + 5).concat(posts.slice(0, Math.max(0, 4 - (posts.length - currentIndex - 1)))).slice(0, 4).map((post, idx) => {
                const postColors = getSubredditColor(post.subreddit);
                return (
                  <div key={post.id} className={`flex items-center gap-3 transition-opacity ${idx === 0 ? 'opacity-90' : idx === 1 ? 'opacity-60' : 'opacity-40'}`}>
                    {/* Thumbnail */}
                    {(post.preview || post.thumbnail) && (
                      <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border border-zinc-700/50">
                        <img
                          src={post.preview || post.thumbnail || ''}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      </div>
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className={`text-xs font-bold ${postColors.text}`}>r/{post.subreddit}</span>
                      <span className="text-zinc-400 text-sm truncate max-w-[200px]">{post.title}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ TOP 3 SLIDE ============
function Top3Slide({ projects }: { projects: Project[] }) {
  const activeProjects = projects
    .filter(p => p.status === 'active')
    .slice(0, 3);

  return (
    <div className="flex flex-col h-full p-12 bg-gradient-to-br from-zinc-900 via-black to-zinc-900">
      <motion.h2
        initial={{ opacity: 0, y: -50, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="text-5xl font-bold text-emerald-400 mb-12 text-center"
      >
        Top Projects In Talks
      </motion.h2>
      <div className="flex-1 grid grid-cols-3 gap-8">
        {activeProjects.map((project, index) => (
          <motion.div
            key={project.id}
            initial={{
              opacity: 0,
              y: 150,
              scale: 0.7,
              rotateY: index === 1 ? 0 : index === 0 ? 25 : -25,
            }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              rotateY: 0,
            }}
            transition={{
              duration: 0.8,
              delay: index * 0.15 + 0.3,
              ease: [0.25, 0.46, 0.45, 0.94],
            }}
            whileHover={{
              scale: 1.05,
              y: -10,
              boxShadow: '0 25px 50px rgba(16, 185, 129, 0.2)',
              transition: { duration: 0.2 }
            }}
            className="flex flex-col bg-zinc-900/80 rounded-3xl border border-zinc-700 p-8"
          >
            <div className="flex items-center gap-4 mb-6">
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{
                  type: 'spring',
                  stiffness: 400,
                  damping: 15,
                  delay: index * 0.15 + 0.5,
                }}
                className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-4xl font-bold text-emerald-400"
              >
                {index + 1}
              </motion.div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-white line-clamp-2">{project.title}</h3>
              </div>
            </div>
            {project.description && (
              <p className="text-xl text-zinc-400 line-clamp-3 mb-6 flex-1">{project.description}</p>
            )}
            {project.tags && project.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {project.tags.slice(0, 3).map((tag, tagIndex) => (
                  <motion.span
                    key={tag}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.15 + tagIndex * 0.05 + 0.7 }}
                    className="px-3 py-1 bg-zinc-800 text-zinc-300 rounded-full text-sm"
                  >
                    {tag}
                  </motion.span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-4 text-zinc-500">
              {project.githubUrl && <Github className="h-6 w-6" />}
              {project.deploymentUrl && <Globe className="h-6 w-6 text-emerald-400" />}
            </div>
          </motion.div>
        ))}
        {activeProjects.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="col-span-3 flex items-center justify-center text-2xl text-zinc-600"
          >
            No projects in talks
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ============ SINGLE COLUMN SLIDE ============
function SingleColumnSlide({ projects, status, config }: {
  projects: Project[];
  status: ProjectStatus;
  config: { label: string; icon: React.ElementType; headerColor: string; countColor: string };
}) {
  const columnProjects = projects.filter(p => p.status === status);
  const Icon = config.icon;

  return (
    <div className="flex flex-col h-full p-8 bg-gradient-to-br from-zinc-900 via-black to-zinc-900">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="flex items-center justify-center gap-6 mb-8"
      >
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.2 }}
        >
          <Icon className={`h-16 w-16 ${config.headerColor}`} />
        </motion.div>
        <h2 className={`text-6xl font-bold ${config.headerColor}`}>{config.label}</h2>
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 25, delay: 0.3 }}
          className={`px-6 py-3 text-3xl font-bold rounded-full border ${config.countColor}`}
        >
          {columnProjects.length}
        </motion.span>
      </motion.div>

      {/* Projects grid */}
      <div className="flex-1 grid grid-cols-3 gap-6 overflow-hidden">
        {columnProjects.slice(0, 9).map((project, index) => (
          <motion.div
            key={project.id}
            initial={{
              opacity: 0,
              scale: 0.5,
              y: 100,
              rotateX: 45,
            }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              rotateX: 0,
            }}
            transition={{
              duration: 0.6,
              delay: index * 0.1 + 0.3,
              ease: [0.25, 0.46, 0.45, 0.94],
            }}
            whileHover={{
              scale: 1.05,
              y: -8,
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              transition: { duration: 0.2 }
            }}
            className="bg-zinc-900/80 rounded-2xl border border-zinc-800 p-6"
          >
            <h3 className="text-xl font-semibold text-white mb-3 line-clamp-2">{project.title}</h3>
            {project.description && (
              <p className="text-zinc-400 line-clamp-2 mb-4">{project.description}</p>
            )}
            {project.tags && project.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {project.tags.slice(0, 2).map(tag => (
                  <span key={tag} className="px-2 py-1 bg-zinc-800 text-zinc-400 rounded-full text-xs">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        ))}
        {columnProjects.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="col-span-3 flex items-center justify-center text-2xl text-zinc-600"
          >
            No {config.label.toLowerCase()} projects
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ============ GITHUB DATA TYPES ============
interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  state: string;
  created_at: string;
  user: { login: string; avatar_url: string };
  labels: { name: string; color: string }[];
  comments: number;
}

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
  author: { login: string; avatar_url: string } | null;
}

// ============ PARSE GITHUB URL ============
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  try {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (match) {
      return { owner: match[1], repo: match[2].replace('.git', '') };
    }
  } catch {}
  return null;
}

// ============ PROJECT DETAIL MODAL ============
function ProjectDetailModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'issues' | 'commits'>('overview');
  const statusConfig = columns.find((c) => c.status === project.status);
  const Icon = statusConfig?.icon || Rocket;

  const githubInfo = project.githubUrl ? parseGitHubUrl(project.githubUrl) : null;

  // Fetch GitHub issues
  const { data: issues, isLoading: issuesLoading } = useQuery({
    queryKey: ['github-issues', githubInfo?.owner, githubInfo?.repo],
    queryFn: async () => {
      if (!githubInfo) return [];
      const res = await fetch(`https://api.github.com/repos/${githubInfo.owner}/${githubInfo.repo}/issues?state=all&per_page=20`);
      if (!res.ok) throw new Error('Failed to fetch issues');
      return res.json() as Promise<GitHubIssue[]>;
    },
    enabled: !!githubInfo && activeTab === 'issues',
    staleTime: 60000,
  });

  // Fetch GitHub commits
  const { data: commits, isLoading: commitsLoading } = useQuery({
    queryKey: ['github-commits', githubInfo?.owner, githubInfo?.repo],
    queryFn: async () => {
      if (!githubInfo) return [];
      const res = await fetch(`https://api.github.com/repos/${githubInfo.owner}/${githubInfo.repo}/commits?per_page=20`);
      if (!res.ok) throw new Error('Failed to fetch commits');
      return res.json() as Promise<GitHubCommit[]>;
    },
    enabled: !!githubInfo && activeTab === 'commits',
    staleTime: 60000,
  });

  const isOverdue = project.isOverdue || (
    project.targetEndDate &&
    !['completed', 'archived', 'cancelled'].includes(project.status) &&
    new Date(project.targetEndDate) < new Date()
  );

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getTagColor = (tag: string) => {
    const colors = [
      'bg-blue-500/20 text-blue-300 border-blue-500/30',
      'bg-purple-500/20 text-purple-300 border-purple-500/30',
      'bg-pink-500/20 text-pink-300 border-pink-500/30',
      'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      'bg-amber-500/20 text-amber-300 border-amber-500/30',
      'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    ];
    const hash = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  // Close on escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-8" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-zinc-900 rounded-3xl border border-zinc-700 shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-8 border-b border-zinc-800">
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-4 mb-4">
              <Icon className={`h-10 w-10 ${statusConfig?.headerColor}`} />
              <span className={`px-4 py-2 text-lg font-bold rounded-full border ${statusConfig?.countColor}`}>
                {statusConfig?.label}
              </span>
              {isOverdue && (
                <span className="flex items-center gap-2 px-4 py-2 text-lg font-bold rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                  <AlertTriangle className="h-5 w-5" />
                  Overdue
                </span>
              )}
            </div>
            <h2 className="text-4xl font-bold text-white leading-tight">{project.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors"
          >
            <X className="h-8 w-8 text-zinc-400" />
          </button>
        </div>

        {/* Tabs */}
        {githubInfo && (
          <div className="flex gap-2 px-8 pt-6">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-6 py-3 rounded-xl text-lg font-semibold transition-colors ${
                activeTab === 'overview' ? 'bg-zinc-700 text-white' : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('issues')}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-lg font-semibold transition-colors ${
                activeTab === 'issues' ? 'bg-zinc-700 text-white' : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              <CircleDot className="h-5 w-5" />
              Issues
            </button>
            <button
              onClick={() => setActiveTab('commits')}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-lg font-semibold transition-colors ${
                activeTab === 'commits' ? 'bg-zinc-700 text-white' : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              <GitCommit className="h-5 w-5" />
              Commits
            </button>
          </div>
        )}

        {/* Content */}
        <div className="p-8 overflow-y-auto max-h-[calc(90vh-220px)]">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <>
              {/* Description */}
              {project.description && (
                <div className="mb-8">
                  <h3 className="text-xl font-semibold text-zinc-400 mb-3">Description</h3>
                  <p className="text-2xl text-zinc-200 leading-relaxed whitespace-pre-wrap">
                    {project.description}
                  </p>
                </div>
              )}

              {/* Tags */}
              {project.tags && project.tags.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-xl font-semibold text-zinc-400 mb-3">Tags</h3>
                  <div className="flex flex-wrap gap-3">
                    {project.tags.map((tag) => (
                      <span key={tag} className={`px-4 py-2 text-lg font-medium rounded-full border ${getTagColor(tag)}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Dates Grid */}
              <div className="grid grid-cols-3 gap-6 mb-8">
                {project.startDate && (
                  <div className="bg-zinc-800/50 rounded-2xl p-6">
                    <div className="flex items-center gap-3 text-zinc-400 mb-2">
                      <CalendarDays className="h-6 w-6" />
                      <span className="text-lg">Start Date</span>
                    </div>
                    <p className="text-2xl font-semibold text-white">{formatDate(project.startDate)}</p>
                  </div>
                )}
                {project.targetEndDate && (
                  <div className={`rounded-2xl p-6 ${isOverdue ? 'bg-red-500/10 border border-red-500/30' : 'bg-zinc-800/50'}`}>
                    <div className={`flex items-center gap-3 mb-2 ${isOverdue ? 'text-red-400' : 'text-zinc-400'}`}>
                      <Calendar className="h-6 w-6" />
                      <span className="text-lg">Target End</span>
                    </div>
                    <p className={`text-2xl font-semibold ${isOverdue ? 'text-red-300' : 'text-white'}`}>
                      {formatDate(project.targetEndDate)}
                    </p>
                  </div>
                )}
                {project.actualEndDate && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6">
                    <div className="flex items-center gap-3 text-emerald-400 mb-2">
                      <CheckCircle2 className="h-6 w-6" />
                      <span className="text-lg">Completed</span>
                    </div>
                    <p className="text-2xl font-semibold text-emerald-300">{formatDate(project.actualEndDate)}</p>
                  </div>
                )}
              </div>

              {/* Live Deployment */}
              {project.deploymentUrl && (
                <div className="mb-8">
                  <h3 className="text-xl font-semibold text-zinc-400 mb-3">Live Deployment</h3>
                  <a
                    href={project.deploymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-3 px-6 py-4 bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors text-xl text-white font-semibold"
                  >
                    <Play className="h-7 w-7" />
                    <span>View Live Site</span>
                    <ExternalLink className="h-5 w-5" />
                  </a>
                </div>
              )}

              {/* GitHub Link */}
              {project.githubUrl && (
                <div className="mb-8">
                  <h3 className="text-xl font-semibold text-zinc-400 mb-3">Repository</h3>
                  <a
                    href={project.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-3 px-6 py-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors text-xl text-white"
                  >
                    <Github className="h-7 w-7" />
                    <span className="truncate max-w-lg">{project.githubUrl}</span>
                    <ExternalLink className="h-5 w-5 text-zinc-400" />
                  </a>
                </div>
              )}

              {/* Created By */}
              {project.createdBy && (
                <div className="flex items-center gap-4 text-zinc-500">
                  <User className="h-6 w-6" />
                  <span className="text-lg">
                    Created by {project.createdBy.name || project.createdBy.email || 'Unknown'}
                  </span>
                </div>
              )}
            </>
          )}

          {/* Issues Tab */}
          {activeTab === 'issues' && (
            <div className="space-y-4">
              {issuesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-10 w-10 text-emerald-400 animate-spin" />
                </div>
              ) : issues && issues.length > 0 ? (
                issues.map((issue) => (
                  <a
                    key={issue.id}
                    href={`https://github.com/${githubInfo?.owner}/${githubInfo?.repo}/issues/${issue.number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-4 p-5 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-colors"
                  >
                    <CircleDot className={`h-6 w-6 mt-1 flex-shrink-0 ${issue.state === 'open' ? 'text-emerald-400' : 'text-purple-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xl font-semibold text-white">{issue.title}</span>
                        <span className="text-zinc-500">#{issue.number}</span>
                      </div>
                      <div className="flex items-center gap-4 text-zinc-500">
                        <span>{issue.state === 'open' ? 'Open' : 'Closed'}</span>
                        <span>{formatRelativeTime(issue.created_at)}</span>
                        {issue.comments > 0 && (
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-4 w-4" />
                            {issue.comments}
                          </span>
                        )}
                      </div>
                      {issue.labels.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {issue.labels.map((label) => (
                            <span
                              key={label.name}
                              className="px-3 py-1 text-sm rounded-full"
                              style={{ backgroundColor: `#${label.color}30`, color: `#${label.color}`, border: `1px solid #${label.color}50` }}
                            >
                              {label.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </a>
                ))
              ) : (
                <div className="text-center py-12 text-zinc-500 text-xl">No issues found</div>
              )}
            </div>
          )}

          {/* Commits Tab */}
          {activeTab === 'commits' && (
            <div className="space-y-4">
              {commitsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-10 w-10 text-emerald-400 animate-spin" />
                </div>
              ) : commits && commits.length > 0 ? (
                commits.map((commit) => (
                  <a
                    key={commit.sha}
                    href={`https://github.com/${githubInfo?.owner}/${githubInfo?.repo}/commit/${commit.sha}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-4 p-5 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-colors"
                  >
                    <GitCommit className="h-6 w-6 mt-1 text-blue-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xl font-semibold text-white line-clamp-2 mb-2">
                        {commit.commit.message.split('\n')[0]}
                      </p>
                      <div className="flex items-center gap-4 text-zinc-500">
                        {commit.author && (
                          <div className="flex items-center gap-2">
                            <img src={commit.author.avatar_url} alt="" className="h-5 w-5 rounded-full" />
                            <span>{commit.author.login}</span>
                          </div>
                        )}
                        {!commit.author && <span>{commit.commit.author.name}</span>}
                        <span>{formatRelativeTime(commit.commit.author.date)}</span>
                        <span className="font-mono text-sm">{commit.sha.substring(0, 7)}</span>
                      </div>
                    </div>
                  </a>
                ))
              ) : (
                <div className="text-center py-12 text-zinc-500 text-xl">No commits found</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ PROJECT CARD ============
function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  const isOverdue = project.isOverdue || (
    project.targetEndDate &&
    !['completed', 'archived', 'cancelled'].includes(project.status) &&
    new Date(project.targetEndDate) < new Date()
  );

  const daysUntilDue = project.daysUntilDue ?? (
    project.targetEndDate
      ? Math.ceil((new Date(project.targetEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null
  );

  const formatDueDate = () => {
    if (!project.targetEndDate) return null;
    const date = new Date(project.targetEndDate);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getTagColor = (tag: string) => {
    const colors = [
      'bg-blue-500/20 text-blue-300 border-blue-500/30',
      'bg-purple-500/20 text-purple-300 border-purple-500/30',
      'bg-pink-500/20 text-pink-300 border-pink-500/30',
      'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      'bg-amber-500/20 text-amber-300 border-amber-500/30',
      'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    ];
    const hash = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  return (
    <div
      onClick={onClick}
      className="bg-zinc-900/80 backdrop-blur-sm rounded-xl p-5 border border-zinc-800 shadow-lg cursor-pointer hover:bg-zinc-800/80 hover:border-zinc-700 hover:scale-[1.02] transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-xl font-semibold text-zinc-100 leading-tight line-clamp-2">
          {project.title}
        </h3>
        <div className="flex items-center gap-2 flex-shrink-0">
          {project.deploymentUrl && <Globe className="h-5 w-5 text-emerald-400" title="Live deployment" />}
          {project.githubUrl && <Github className="h-5 w-5 text-zinc-500" />}
          {isOverdue && <AlertTriangle className="h-5 w-5 text-red-400 animate-pulse" />}
        </div>
      </div>

      {project.description && (
        <p className="text-base text-zinc-400 line-clamp-2 mb-4 leading-relaxed">
          {project.description}
        </p>
      )}

      {project.tags && project.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {project.tags.slice(0, 3).map((tag) => (
            <span key={tag} className={`px-3 py-1 text-sm font-medium rounded-full border ${getTagColor(tag)}`}>
              {tag}
            </span>
          ))}
          {project.tags.length > 3 && (
            <span className="px-3 py-1 text-sm font-medium rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
              +{project.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {project.targetEndDate && (
        <div className={`flex items-center gap-2 text-sm ${
          isOverdue ? 'text-red-400' : daysUntilDue !== null && daysUntilDue <= 7 ? 'text-amber-400' : 'text-zinc-500'
        }`}>
          {isOverdue ? <Clock className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
          <span className="font-medium">
            {isOverdue
              ? `${Math.abs(daysUntilDue || 0)} days overdue`
              : daysUntilDue === 0
              ? 'Due today'
              : daysUntilDue === 1
              ? 'Due tomorrow'
              : `Due ${formatDueDate()}`}
          </span>
        </div>
      )}
    </div>
  );
}

// ============ COLUMN CONFIG ============
const columns: { status: ProjectStatus; label: string; icon: React.ElementType; headerColor: string; countColor: string }[] = [
  { status: 'active', label: 'In Talks', icon: MessageSquare, headerColor: 'text-emerald-400', countColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  { status: 'on_hold', label: 'Now Coding', icon: Rocket, headerColor: 'text-amber-400', countColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  { status: 'completed', label: 'In Review', icon: CircleDot, headerColor: 'text-blue-400', countColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  { status: 'archived', label: 'Complete', icon: CheckCircle2, headerColor: 'text-zinc-400', countColor: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30' },
];

// ============ MAIN BOARD ============
function TVBoard() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Slideshow state
  const [slideshowSettings, setSlideshowSettings] = useState<SlideshowSettings>(() => loadSlideshowSettings());
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [slideProgress, setSlideProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Remote control state
  const [speed, setSpeed] = useState(1);
  const [brightness, setBrightness] = useState(100);

  // Room code for cross-device remote connection
  const [roomCode, setRoomCode] = useState<string | undefined>(undefined);
  const [showRoomCode, setShowRoomCode] = useState(false);

  // Load/generate room code on mount
  useEffect(() => {
    const savedRoom = localStorage.getItem('tv-display-room');
    if (savedRoom) {
      setRoomCode(savedRoom);
    }
  }, []);

  // Generate a new room code
  const createRoomCode = () => {
    const code = generateRoomCode();
    setRoomCode(code);
    localStorage.setItem('tv-display-room', code);
    setShowRoomCode(true);
  };

  // Clear room code (disconnect)
  const clearRoomCode = () => {
    setRoomCode(undefined);
    localStorage.removeItem('tv-display-room');
    setShowRoomCode(false);
  };

  // Toggle fullscreen mode
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  };

  // Listen for fullscreen changes (e.g., user presses Escape)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Slideshow auto-advance
  useEffect(() => {
    if (!slideshowSettings.enabled || isPaused || slideshowSettings.slides.length === 0) {
      return;
    }

    const currentSlide = slideshowSettings.slides[currentSlideIndex];
    const duration = currentSlide?.duration || 10;
    // Apply speed multiplier: higher speed = faster progression
    const effectiveDuration = duration / speed;

    // Progress timer (updates every 100ms for smooth progress bar)
    const progressInterval = setInterval(() => {
      setSlideProgress((prev) => {
        const newProgress = prev + (100 / (effectiveDuration * 10));
        if (newProgress >= 100) {
          // Move to next slide
          setCurrentSlideIndex((prevIndex) => (prevIndex + 1) % slideshowSettings.slides.length);
          return 0;
        }
        return newProgress;
      });
    }, 100);

    return () => clearInterval(progressInterval);
  }, [slideshowSettings.enabled, slideshowSettings.slides, currentSlideIndex, isPaused, speed]);

  // Reset progress when slide changes
  useEffect(() => {
    setSlideProgress(0);
  }, [currentSlideIndex]);

  const goToNextSlide = () => {
    if (slideshowSettings.slides.length > 0) {
      setCurrentSlideIndex((prev) => (prev + 1) % slideshowSettings.slides.length);
      setSlideProgress(0);
    }
  };

  const goToPrevSlide = () => {
    if (slideshowSettings.slides.length > 0) {
      setCurrentSlideIndex((prev) => (prev - 1 + slideshowSettings.slides.length) % slideshowSettings.slides.length);
      setSlideProgress(0);
    }
  };

  const goToSlide = (index: number) => {
    if (index >= 0 && index < slideshowSettings.slides.length) {
      setCurrentSlideIndex(index);
      setSlideProgress(0);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          goToNextSlide();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          goToPrevSlide();
          break;
        case ' ': // Spacebar
          e.preventDefault();
          setIsPaused((prev) => !prev);
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'Escape':
          if (showSettings) {
            setShowSettings(false);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slideshowSettings.slides.length, showSettings]);

  const { data, isLoading, error, dataUpdatedAt, isRefetching, refetch } = useQuery({
    queryKey: ['projects-tv-board'],
    queryFn: () => api.get<PaginatedResponse<Project>>('/api/projects?limit=200'),
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
  });

  // Clock
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Update tracker
  useEffect(() => {
    if (dataUpdatedAt) {
      const interval = setInterval(() => {
        setSecondsSinceUpdate(Math.floor((Date.now() - dataUpdatedAt) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [dataUpdatedAt]);

  // Hide cursor after inactivity
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const hide = () => { document.body.style.cursor = 'none'; };
    const show = () => {
      document.body.style.cursor = 'default';
      clearTimeout(timeout);
      timeout = setTimeout(hide, 3000);
    };
    document.addEventListener('mousemove', show);
    timeout = setTimeout(hide, 3000);
    return () => {
      document.removeEventListener('mousemove', show);
      clearTimeout(timeout);
      document.body.style.cursor = 'default';
    };
  }, []);

  // Slide management functions
  const addSlide = useCallback((slide: RemoteSlideConfig) => {
    const newSettings = {
      ...slideshowSettings,
      slides: [...slideshowSettings.slides, slide as SlideConfig],
    };
    setSlideshowSettings(newSettings);
    saveSlideshowSettings(newSettings);
  }, [slideshowSettings]);

  const removeSlide = useCallback((index: number) => {
    const newSettings = {
      ...slideshowSettings,
      slides: slideshowSettings.slides.filter((_, i) => i !== index),
    };
    setSlideshowSettings(newSettings);
    saveSlideshowSettings(newSettings);
    // Adjust current index if needed
    if (currentSlideIndex >= newSettings.slides.length && newSettings.slides.length > 0) {
      setCurrentSlideIndex(newSettings.slides.length - 1);
    }
  }, [slideshowSettings, currentSlideIndex]);

  const updateSlide = useCallback((index: number, updates: Partial<RemoteSlideConfig>) => {
    const newSlides = [...slideshowSettings.slides];
    newSlides[index] = { ...newSlides[index], ...updates } as SlideConfig;
    const newSettings = { ...slideshowSettings, slides: newSlides };
    setSlideshowSettings(newSettings);
    saveSlideshowSettings(newSettings);
  }, [slideshowSettings]);

  const reorderSlide = useCallback((fromIndex: number, toIndex: number) => {
    const newSlides = [...slideshowSettings.slides];
    const [moved] = newSlides.splice(fromIndex, 1);
    newSlides.splice(toIndex, 0, moved);
    const newSettings = { ...slideshowSettings, slides: newSlides };
    setSlideshowSettings(newSettings);
    saveSlideshowSettings(newSettings);
    // Adjust current index to follow the moved slide if needed
    if (currentSlideIndex === fromIndex) {
      setCurrentSlideIndex(toIndex);
    }
  }, [slideshowSettings, currentSlideIndex]);

  const toggleSlideshowEnabled = useCallback((enabled: boolean) => {
    const newSettings = { ...slideshowSettings, enabled };
    setSlideshowSettings(newSettings);
    saveSlideshowSettings(newSettings);
  }, [slideshowSettings]);

  // Remote control handlers
  const remoteHandlers = useMemo<TVRemoteHandlers>(() => ({
    onNext: goToNextSlide,
    onPrev: goToPrevSlide,
    onGoTo: goToSlide,
    onPause: () => setIsPaused(true),
    onPlay: () => setIsPaused(false),
    onTogglePause: () => setIsPaused((prev) => !prev),
    onFullscreen: toggleFullscreen,
    onSetSpeed: setSpeed,
    onSetBrightness: setBrightness,
    onRefresh: () => refetch(),
    // Slide management
    onAddSlide: addSlide,
    onRemoveSlide: removeSlide,
    onUpdateSlide: updateSlide,
    onReorderSlide: reorderSlide,
    onToggleSlideshow: toggleSlideshowEnabled,
    getStatus: () => ({
      currentSlideIndex,
      totalSlides: slideshowSettings.slides.length,
      isPaused,
      isFullscreen,
      currentSlideLabel: slideshowSettings.slides[currentSlideIndex]?.label || 'Unknown',
      speed,
      brightness,
      slideshowEnabled: slideshowSettings.enabled,
      slides: slideshowSettings.slides,
    }),
  }), [currentSlideIndex, slideshowSettings, isPaused, isFullscreen, speed, brightness, refetch, addSlide, removeSlide, updateSlide, reorderSlide, toggleSlideshowEnabled]);

  // Enable remote control via BroadcastChannel
  const { broadcastStatus, connectionMode, roomInfo } = useTVRemoteReceiver(remoteHandlers, roomCode);

  // Broadcast status when state changes
  useEffect(() => {
    broadcastStatus();
  }, [currentSlideIndex, isPaused, isFullscreen, speed, brightness, slideshowSettings.slides, broadcastStatus]);

  const formatTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-black">
        <Loader2 className="h-20 w-20 text-emerald-400 animate-spin mb-8" />
        <p className="text-3xl text-zinc-400">Loading projects...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-black">
        <WifiOff className="h-20 w-20 text-red-400 mb-8" />
        <p className="text-3xl text-zinc-400 mb-4">Failed to load projects</p>
        <p className="text-xl text-zinc-600">{(error as Error).message}</p>
      </div>
    );
  }

  const projects = data?.data || [];
  const projectsByStatus = columns.reduce<Record<ProjectStatus, Project[]>>((acc, col) => {
    acc[col.status] = projects.filter((p) => p.status === col.status);
    return acc;
  }, {} as Record<ProjectStatus, Project[]>);

  // Get current slide info
  const currentSlide = slideshowSettings.slides[currentSlideIndex];

  // Render slide content based on type
  const renderSlideContent = () => {
    if (!slideshowSettings.enabled || !currentSlide) {
      // Default: show kanban overview with animations
      return (
        <div className="flex-1 grid grid-cols-4 gap-4 p-6 overflow-hidden">
          {columns.map((col, colIndex) => {
            const Icon = col.icon;
            const colProjects = projectsByStatus[col.status] || [];
            return (
              <motion.div
                key={col.status}
                initial={{ opacity: 0, y: 50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  duration: 0.5,
                  delay: colIndex * 0.1,
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
                className="flex flex-col bg-zinc-900/30 rounded-2xl border border-zinc-800/50 overflow-hidden"
              >
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: colIndex * 0.1 + 0.2 }}
                  className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/50"
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`h-7 w-7 ${col.headerColor}`} />
                    <h2 className={`text-2xl font-bold ${col.headerColor}`}>{col.label}</h2>
                  </div>
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 500,
                      damping: 25,
                      delay: colIndex * 0.1 + 0.3,
                    }}
                    className={`px-4 py-1.5 text-xl font-bold rounded-full border ${col.countColor}`}
                  >
                    {colProjects.length}
                  </motion.span>
                </motion.div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {colProjects.length > 0 ? (
                    colProjects.map((p, cardIndex) => (
                      <motion.div
                        key={p.id}
                        initial={{
                          opacity: 0,
                          x: colIndex % 2 === 0 ? -100 : 100,
                          y: 20,
                          rotateY: colIndex % 2 === 0 ? -15 : 15,
                        }}
                        animate={{
                          opacity: 1,
                          x: 0,
                          y: 0,
                          rotateY: 0,
                        }}
                        transition={{
                          duration: 0.6,
                          delay: colIndex * 0.15 + cardIndex * 0.08 + 0.3,
                          ease: [0.25, 0.46, 0.45, 0.94],
                        }}
                        whileHover={{
                          scale: 1.02,
                          y: -4,
                          transition: { duration: 0.2 }
                        }}
                      >
                        <ProjectCard project={p} onClick={() => setSelectedProject(p)} />
                      </motion.div>
                    ))
                  ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: colIndex * 0.1 + 0.4 }}
                      className="flex items-center justify-center h-32 text-zinc-700 text-xl"
                    >
                      No projects
                    </motion.div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      );
    }

    switch (currentSlide.type) {
      case 'logo':
        return <LogoSlide />;
      case 'top3':
        return <Top3Slide projects={projects} />;
      case 'recent-issues':
        return <RecentIssuesSlide projects={projects} />;
      case 'recent-commits':
        return <RecentCommitsSlide projects={projects} />;
      case 'hacker-news':
        return <HackerNewsSlide />;
      case 'reddit':
        return <RedditSlide subreddits={slideshowSettings.redditSubreddits || DEFAULT_SUBREDDITS} />;
      case 'video':
        return currentSlide.url ? <VideoSlide url={currentSlide.url} label={currentSlide.label} /> : <LogoSlide />;
      case 'youtube':
        return currentSlide.url ? <YouTubeSlide url={currentSlide.url} label={currentSlide.label} /> : <LogoSlide />;
      case 'column-active':
        return <SingleColumnSlide projects={projects} status="active" config={columns[0]} />;
      case 'column-on_hold':
        return <SingleColumnSlide projects={projects} status="on_hold" config={columns[1]} />;
      case 'column-completed':
        return <SingleColumnSlide projects={projects} status="completed" config={columns[2]} />;
      case 'column-archived':
        return <SingleColumnSlide projects={projects} status="archived" config={columns[3]} />;
      case 'overview':
      default:
        return (
          <div className="flex-1 grid grid-cols-4 gap-4 p-6 overflow-hidden">
            {columns.map((col, colIndex) => {
              const Icon = col.icon;
              const colProjects = projectsByStatus[col.status] || [];
              return (
                <motion.div
                  key={col.status}
                  initial={{ opacity: 0, y: 50, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    duration: 0.5,
                    delay: colIndex * 0.1,
                    ease: [0.25, 0.46, 0.45, 0.94],
                  }}
                  className="flex flex-col bg-zinc-900/30 rounded-2xl border border-zinc-800/50 overflow-hidden"
                >
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: colIndex * 0.1 + 0.2 }}
                    className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/50"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`h-7 w-7 ${col.headerColor}`} />
                      <h2 className={`text-2xl font-bold ${col.headerColor}`}>{col.label}</h2>
                    </div>
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{
                        type: 'spring',
                        stiffness: 500,
                        damping: 25,
                        delay: colIndex * 0.1 + 0.3,
                      }}
                      className={`px-4 py-1.5 text-xl font-bold rounded-full border ${col.countColor}`}
                    >
                      {colProjects.length}
                    </motion.span>
                  </motion.div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {colProjects.length > 0 ? (
                      colProjects.map((p, cardIndex) => (
                        <motion.div
                          key={p.id}
                          initial={{
                            opacity: 0,
                            x: colIndex % 2 === 0 ? -100 : 100,
                            y: 20,
                            rotateY: colIndex % 2 === 0 ? -15 : 15,
                          }}
                          animate={{
                            opacity: 1,
                            x: 0,
                            y: 0,
                            rotateY: 0,
                          }}
                          transition={{
                            duration: 0.6,
                            delay: colIndex * 0.15 + cardIndex * 0.08 + 0.3,
                            ease: [0.25, 0.46, 0.45, 0.94],
                          }}
                          whileHover={{
                            scale: 1.02,
                            y: -4,
                            transition: { duration: 0.2 }
                          }}
                        >
                          <ProjectCard project={p} onClick={() => setSelectedProject(p)} />
                        </motion.div>
                      ))
                    ) : (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: colIndex * 0.1 + 0.4 }}
                        className="flex items-center justify-center h-32 text-zinc-700 text-xl"
                      >
                        No projects
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        );
    }
  };

  // Hide header for logo slide (including fallback cases when video/youtube has no URL)
  const isLogoSlide = currentSlide?.type === 'logo' ||
    (currentSlide?.type === 'video' && !currentSlide?.url) ||
    (currentSlide?.type === 'youtube' && !currentSlide?.url);

  // Slide transition animation variants
  const slideVariants = {
    enter: {
      opacity: 0,
      scale: 1.02,
      filter: 'blur(10px)',
    },
    center: {
      opacity: 1,
      scale: 1,
      filter: 'blur(0px)',
    },
    exit: {
      opacity: 0,
      scale: 0.98,
      filter: 'blur(10px)',
    },
  };

  return (
    <div
      className="flex flex-col h-screen bg-black text-white transition-[filter] duration-300"
      style={{ filter: brightness !== 100 ? `brightness(${brightness}%)` : undefined }}
    >
      {/* Progress bar for slideshow - hidden on logo slide */}
      {slideshowSettings.enabled && slideshowSettings.slides.length > 0 && !isLogoSlide && (
        <div className="h-1 bg-zinc-800">
          <div
            className="h-full bg-emerald-500 transition-all duration-100 ease-linear"
            style={{ width: `${slideProgress}%` }}
          />
        </div>
      )}

      {/* Header - hidden on logo slide */}
      {!isLogoSlide && (
      <div className="flex items-center justify-between px-8 py-5 border-b border-zinc-800/50">
        <div className="flex items-center gap-6">
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-3 px-4 py-2 rounded-xl hover:bg-zinc-800 transition-colors group"
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Enter fullscreen'}
          >
            <img src="https://i.ibb.co/nsx4Njzz/CODELIVE1.png" alt="CodeLive" className="h-12" />
            {isFullscreen ? (
              <Minimize className="h-6 w-6 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            ) : (
              <Maximize className="h-6 w-6 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            )}
          </button>
          <span className="text-2xl text-zinc-500">{projects.length} projects</span>

          {/* Slideshow indicator */}
          {slideshowSettings.enabled && currentSlide && (
            <div className="flex items-center gap-3 px-4 py-2 bg-zinc-800/50 rounded-xl">
              <span className="text-lg text-zinc-400">
                {currentSlideIndex + 1}/{slideshowSettings.slides.length}
              </span>
              <span className="text-lg text-emerald-400 font-medium">{currentSlide.label}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-6">
          {/* Slideshow controls */}
          <div className="flex items-center gap-2">
            {slideshowSettings.enabled && (
              <>
                <button
                  onClick={goToPrevSlide}
                  className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                  title="Previous slide"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  onClick={() => setIsPaused(!isPaused)}
                  className={`p-2 rounded-lg hover:bg-zinc-800 ${isPaused ? 'text-amber-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                  title={isPaused ? 'Resume' : 'Pause'}
                >
                  {isPaused ? <Play className="h-6 w-6" /> : <Pause className="h-6 w-6" />}
                </button>
                <button
                  onClick={goToNextSlide}
                  className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                  title="Next slide"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
            <button
              onClick={() => setShowSettings(true)}
              className={`p-2 rounded-lg hover:bg-zinc-800 transition-colors ${slideshowSettings.enabled ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}
              title="Slideshow settings"
            >
              <Settings className="h-6 w-6" />
            </button>
          </div>

          {/* Room Code Display */}
          <div className="flex items-center gap-2">
            {roomCode ? (
              <>
                <button
                  onClick={() => setShowRoomCode(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 rounded-xl transition-colors"
                  title="Show QR code for remote connection"
                >
                  <QrCode className="h-5 w-5 text-blue-400" />
                  <span className="text-blue-400 font-mono font-bold tracking-wider">{roomCode}</span>
                  {roomInfo && roomInfo.remoteCount > 0 && (
                    <span className="px-2 py-0.5 bg-blue-500/30 rounded-full text-xs text-blue-300">
                      {roomInfo.remoteCount} connected
                    </span>
                  )}
                </button>
                <button
                  onClick={clearRoomCode}
                  className="p-2 bg-zinc-800 hover:bg-red-500/20 rounded-lg transition-colors text-zinc-500 hover:text-red-400"
                  title="Disable remote"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <button
                onClick={createRoomCode}
                className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors text-zinc-400 hover:text-zinc-300"
                title="Enable remote control"
              >
                <QrCode className="h-5 w-5" />
                <span className="text-sm">Enable Remote</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 text-zinc-500">
            {isRefetching ? (
              <RefreshCw className="h-6 w-6 animate-spin text-emerald-400" />
            ) : (
              <Wifi className="h-6 w-6 text-emerald-400" />
            )}
            <span className="text-xl">{isRefetching ? 'Updating...' : `Updated ${secondsSinceUpdate}s ago`}</span>
          </div>
          <div className="text-right">
            <div className="text-4xl font-mono font-bold tabular-nums">{formatTime(currentTime)}</div>
            <div className="text-lg text-zinc-500">{formatDate(currentTime)}</div>
          </div>
        </div>
      </div>
      )}

      {/* Main content - either slideshow or kanban with animations */}
      <AnimatePresence mode="wait">
        <motion.div
          key={slideshowSettings.enabled ? `slide-${currentSlideIndex}` : 'default'}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            duration: 0.6,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
          className="flex-1 overflow-hidden"
        >
          {renderSlideContent()}
        </motion.div>
      </AnimatePresence>

      {/* Project Detail Modal */}
      {selectedProject && (
        <ProjectDetailModal project={selectedProject} onClose={() => setSelectedProject(null)} />
      )}

      {/* Settings Panel */}
      {showSettings && (
        <SettingsPanel
          settings={slideshowSettings}
          onSettingsChange={setSlideshowSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* QR Code Modal for Remote Connection */}
      {showRoomCode && roomCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8" onClick={() => setShowRoomCode(false)}>
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative bg-zinc-900 rounded-3xl border border-zinc-700 shadow-2xl p-10 max-w-lg w-full text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowRoomCode(false)}
              className="absolute top-4 right-4 p-2 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="h-6 w-6" />
            </button>

            <div className="flex items-center justify-center gap-3 mb-6">
              <Smartphone className="h-8 w-8 text-blue-400" />
              <h2 className="text-3xl font-bold text-white">Connect Remote</h2>
            </div>

            <p className="text-zinc-400 text-lg mb-8">
              Scan this QR code with your iPad or phone to control this TV
            </p>

            {/* QR Code */}
            <div className="bg-white p-6 rounded-2xl inline-block mb-8">
              <QRCodeSVG
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/ipad?room=${roomCode}`}
                size={220}
                level="H"
                includeMargin={false}
              />
            </div>

            {/* Room Code Display */}
            <div className="mb-6">
              <p className="text-zinc-500 text-sm mb-2">Or enter this code manually:</p>
              <div className="inline-flex items-center gap-3 px-8 py-4 bg-zinc-800 rounded-2xl">
                <span className="text-5xl font-mono font-bold text-blue-400 tracking-[0.3em]">{roomCode}</span>
              </div>
            </div>

            <p className="text-zinc-600 text-sm">
              Open <span className="text-zinc-400">/ipad</span> on your device and enter this code
            </p>
          </motion.div>
        </div>
      )}
    </div>
  );
}

// ============ PAGE WRAPPER ============
export default function TVProjectsPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <TVBoard />
    </QueryClientProvider>
  );
}
