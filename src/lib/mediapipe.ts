import type { PoseLandmarker, HandLandmarker } from '@mediapipe/tasks-vision';

const WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

let instance: PoseLandmarker | null = null;
// Cache the in-flight promise so concurrent callers share one init
let initPromise: Promise<PoseLandmarker> | null = null;

/**
 * Returns a singleton PoseLandmarker.
 * Safe to call multiple times — model is only loaded once.
 */
export async function initPoseLandmarker(): Promise<PoseLandmarker> {
  if (instance) return instance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const { PoseLandmarker, FilesetResolver } = await import(
      '@mediapipe/tasks-vision'
    );

    const vision = await FilesetResolver.forVisionTasks(WASM_URL);

    instance = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numPoses: 1,
    });

    return instance;
  })();

  return initPromise;
}

// ── Multi-pose (numPoses: 2) ───────────────────────────────────────────────
let multiPoseInstance: PoseLandmarker | null = null;
let multiPoseInitPromise: Promise<PoseLandmarker> | null = null;

export async function initMultiPoseLandmarker(): Promise<PoseLandmarker> {
  if (multiPoseInstance) return multiPoseInstance;
  if (multiPoseInitPromise) return multiPoseInitPromise;

  multiPoseInitPromise = (async () => {
    const { PoseLandmarker, FilesetResolver } = await import(
      '@mediapipe/tasks-vision'
    );
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    multiPoseInstance = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: 2,
    });
    return multiPoseInstance;
  })();

  return multiPoseInitPromise;
}

let handInstance: HandLandmarker | null = null;
let handInitPromise: Promise<HandLandmarker> | null = null;

export async function initHandLandmarker(): Promise<HandLandmarker> {
  if (handInstance) return handInstance;
  if (handInitPromise) return handInitPromise;

  handInitPromise = (async () => {
    const { HandLandmarker, FilesetResolver } = await import(
      '@mediapipe/tasks-vision'
    );

    const vision = await FilesetResolver.forVisionTasks(WASM_URL);

    handInstance = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: HAND_MODEL_URL,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
    });

    return handInstance;
  })();

  return handInitPromise;
}

export type { PoseLandmarker, HandLandmarker };
