import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const LOCAL_DATA_PATH = path.join(process.cwd(), "data", "sharefair-local-store.json");
const EMPTY_STATE = {
  trips: [],
  settlementRequests: []
};

let writeQueue = Promise.resolve();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeState(state) {
  if (!state || !Array.isArray(state.trips)) {
    return clone(EMPTY_STATE);
  }

  return {
    trips: state.trips,
    settlementRequests: Array.isArray(state.settlementRequests) ? state.settlementRequests : []
  };
}

async function ensureLocalDataFile() {
  const directory = path.dirname(LOCAL_DATA_PATH);
  await mkdir(directory, { recursive: true });

  try {
    await readFile(LOCAL_DATA_PATH, "utf8");
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      throw error;
    }

    await writeFile(LOCAL_DATA_PATH, JSON.stringify(EMPTY_STATE, null, 2), "utf8");
  }
}

export async function readLocalState() {
  await ensureLocalDataFile();

  try {
    const raw = await readFile(LOCAL_DATA_PATH, "utf8");
    return normalizeState(JSON.parse(raw));
  } catch {
    return clone(EMPTY_STATE);
  }
}

export async function writeLocalState(nextState) {
  const safeState = normalizeState(nextState);

  writeQueue = writeQueue.then(async () => {
    await ensureLocalDataFile();
    await writeFile(LOCAL_DATA_PATH, JSON.stringify(safeState, null, 2), "utf8");
  });

  await writeQueue;
  return clone(safeState);
}

export async function updateLocalState(updater) {
  const currentState = await readLocalState();
  const nextState = await updater(clone(currentState));
  return writeLocalState(nextState);
}
