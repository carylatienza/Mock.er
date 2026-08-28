/* eslint-disable react/no-unknown-property */
'use client';

import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { compositeJerseyTexture } from '@/lib/garment/compositeJerseyTexture';
import type { Rgb } from '@/lib/garment/extractBaseColor';
import { applyPlanarUvMapping, fitJerseyModel } from '@/lib/garment/planarUvMap';

// MIT — FrancescoCastaldi/mini-jersey-studio (classic tee mesh)
const MODEL_PATH = '/models/jersey.glb';

useGLTF.preload(MODEL_PATH);

interface JerseyProps {
  designUrl?: string | null;
  sideColor?: Rgb | null;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function jerseyMaterial(map: THREE.Texture | null): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map,
    color: map ? '#ffffff' : '#d1d5db',
    roughness: 0.82,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
}

export default function Jersey({ designUrl, sideColor }: JerseyProps) {
  const { scene } = useGLTF(MODEL_PATH);
  const [compositeTexture, setCompositeTexture] = useState<THREE.CanvasTexture | null>(null);

  const model = useMemo(() => {
    const clone = scene.clone(true);
    const bounds = fitJerseyModel(clone);

    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      applyPlanarUvMapping(child, bounds);
      child.castShadow = true;
      child.receiveShadow = true;
    });

    return clone;
  }, [scene]);

  useEffect(() => {
    if (!designUrl) {
      setCompositeTexture((prev) => {
        prev?.dispose();
        return null;
      });
      return;
    }

    let cancelled = false;

    loadImage(designUrl)
      .then((img) => {
        if (cancelled) return;
        const canvas = compositeJerseyTexture({ designImage: img, sideColor });
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = true;
        tex.anisotropy = 16;
        tex.needsUpdate = true;
        setCompositeTexture((prev) => {
          prev?.dispose();
          return tex;
        });
      })
      .catch((err) => {
        console.error('Failed to load design image', err);
      });

    return () => {
      cancelled = true;
    };
  }, [designUrl, sideColor]);

  useEffect(() => {
    const map = compositeTexture;
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.material = jerseyMaterial(map);
    });
  }, [model, compositeTexture]);

  useEffect(() => {
    return () => {
      compositeTexture?.dispose();
    };
  }, [compositeTexture]);

  return <primitive object={model} />;
}
