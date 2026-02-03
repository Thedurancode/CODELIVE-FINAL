'use client';

/**
 * Idle Agents Three.js Scene
 *
 * A premium 3D visualization with glowing orbs and particle effects
 * representing resting AI agents.
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface IdleAgentsSceneProps {
  className?: string;
}

export function IdleAgentsScene({ className }: IdleAgentsSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    orbs: THREE.Group[];
    particles: THREE.Points;
    animationId: number;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x08080c);
    scene.fog = new THREE.FogExp2(0x08080c, 0.04);

    // Camera
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    camera.position.z = 15;
    camera.position.y = 2;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x222233, 1);
    scene.add(ambientLight);

    // Create floating orb groups
    const orbs: THREE.Group[] = [];
    const orbCount = 5;
    const colors = [
      { core: 0xef4444, glow: 0xff6b6b },
      { core: 0xf97316, glow: 0xffa94d },
      { core: 0x3b82f6, glow: 0x60a5fa },
      { core: 0x10b981, glow: 0x34d399 },
      { core: 0x8b5cf6, glow: 0xa78bfa },
    ];

    for (let i = 0; i < orbCount; i++) {
      const group = new THREE.Group();
      const color = colors[i % colors.length];

      // Core sphere
      const coreGeometry = new THREE.SphereGeometry(0.35, 32, 32);
      const coreMaterial = new THREE.MeshBasicMaterial({
        color: color.core,
      });
      const core = new THREE.Mesh(coreGeometry, coreMaterial);
      group.add(core);

      // Inner glow
      const innerGlowGeometry = new THREE.SphereGeometry(0.5, 24, 24);
      const innerGlowMaterial = new THREE.MeshBasicMaterial({
        color: color.glow,
        transparent: true,
        opacity: 0.35,
        side: THREE.BackSide,
      });
      const innerGlow = new THREE.Mesh(innerGlowGeometry, innerGlowMaterial);
      group.add(innerGlow);

      // Outer glow
      const outerGlowGeometry = new THREE.SphereGeometry(0.8, 24, 24);
      const outerGlowMaterial = new THREE.MeshBasicMaterial({
        color: color.glow,
        transparent: true,
        opacity: 0.12,
        side: THREE.BackSide,
      });
      const outerGlow = new THREE.Mesh(outerGlowGeometry, outerGlowMaterial);
      group.add(outerGlow);

      // Ring
      const ringGeometry = new THREE.TorusGeometry(0.65, 0.02, 16, 64);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: color.glow,
        transparent: true,
        opacity: 0.5,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
      group.add(ring);

      // Second ring
      const ring2Geometry = new THREE.TorusGeometry(0.85, 0.015, 16, 64);
      const ring2Material = new THREE.MeshBasicMaterial({
        color: color.core,
        transparent: true,
        opacity: 0.25,
      });
      const ring2 = new THREE.Mesh(ring2Geometry, ring2Material);
      ring2.rotation.x = Math.PI / 3;
      ring2.rotation.z = Math.PI / 4;
      group.add(ring2);

      // Position
      const angle = (i / orbCount) * Math.PI * 2;
      const radius = 4 + Math.random() * 2;
      group.position.x = Math.cos(angle) * radius;
      group.position.y = (Math.random() - 0.5) * 4;
      group.position.z = Math.sin(angle) * radius - 3;

      group.userData = {
        originalPos: group.position.clone(),
        floatSpeed: 0.3 + Math.random() * 0.3,
        floatPhase: Math.random() * Math.PI * 2,
        orbitSpeed: 0.08 + Math.random() * 0.1,
        pulseSpeed: 0.8 + Math.random() * 0.4,
        pulsePhase: Math.random() * Math.PI * 2,
        ringSpeed: 0.4 + Math.random() * 0.4,
      };

      orbs.push(group);
      scene.add(group);
    }

    // Particles
    const particleCount = 300;
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 6 + Math.random() * 18;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      const colorChoice = Math.random();
      if (colorChoice < 0.25) {
        particleColors[i * 3] = 0.9;
        particleColors[i * 3 + 1] = 0.3;
        particleColors[i * 3 + 2] = 0.3;
      } else if (colorChoice < 0.4) {
        particleColors[i * 3] = 0.3;
        particleColors[i * 3 + 1] = 0.5;
        particleColors[i * 3 + 2] = 0.9;
      } else {
        particleColors[i * 3] = 0.4;
        particleColors[i * 3 + 1] = 0.4;
        particleColors[i * 3 + 2] = 0.5;
      }
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.06,
      transparent: true,
      opacity: 0.7,
      vertexColors: true,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    // Grid
    const gridHelper = new THREE.GridHelper(30, 30, 0x1a1a2e, 0x0d0d15);
    gridHelper.position.y = -4;
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.25;
    scene.add(gridHelper);

    // Animation
    let time = 0;
    const animate = () => {
      time += 0.016;

      orbs.forEach((group, i) => {
        const data = group.userData;

        // Float
        group.position.y = data.originalPos.y + Math.sin(time * data.floatSpeed + data.floatPhase) * 0.6;

        // Orbit
        const orbitAngle = time * data.orbitSpeed + (i / orbs.length) * Math.PI * 2;
        const orbitRadius = data.originalPos.length();
        group.position.x = Math.cos(orbitAngle) * orbitRadius;
        group.position.z = Math.sin(orbitAngle) * orbitRadius - 3;

        // Pulse
        const pulse = 0.95 + Math.sin(time * data.pulseSpeed + data.pulsePhase) * 0.05;
        group.children[0]?.scale.set(pulse, pulse, pulse);

        // Glow pulse
        const glowPulse = 0.25 + Math.sin(time * data.pulseSpeed + data.pulsePhase) * 0.1;
        const innerMat = (group.children[1] as THREE.Mesh)?.material as THREE.MeshBasicMaterial;
        const outerMat = (group.children[2] as THREE.Mesh)?.material as THREE.MeshBasicMaterial;
        if (innerMat) innerMat.opacity = glowPulse + 0.15;
        if (outerMat) outerMat.opacity = glowPulse * 0.4;

        // Rotate rings
        if (group.children[3]) group.children[3].rotation.z += 0.008 * data.ringSpeed;
        if (group.children[4]) {
          group.children[4].rotation.z -= 0.006 * data.ringSpeed;
          group.children[4].rotation.x += 0.004;
        }
      });

      // Rotate particles
      particles.rotation.y += 0.0002;
      particles.rotation.x += 0.0001;

      // Camera movement
      camera.position.x = Math.sin(time * 0.04) * 1.5;
      camera.position.y = 2 + Math.cos(time * 0.025) * 0.8;
      camera.lookAt(0, 0, -2);

      renderer.render(scene, camera);
      sceneRef.current!.animationId = requestAnimationFrame(animate);
    };

    sceneRef.current = { scene, camera, renderer, orbs, particles, animationId: 0 };
    animate();

    const handleResize = () => {
      if (!containerRef.current || !sceneRef.current) return;
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;
      sceneRef.current.camera.aspect = newWidth / newHeight;
      sceneRef.current.camera.updateProjectionMatrix();
      sceneRef.current.renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animationId);
        sceneRef.current.renderer.dispose();
        container.removeChild(sceneRef.current.renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full ${className || ''}`}
      style={{ background: 'linear-gradient(180deg, #08080c 0%, #0c0c14 100%)' }}
    />
  );
}
