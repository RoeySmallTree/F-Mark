import type { StateCreator } from "zustand";
import type { State } from "../storeTypes.js";

export type StoreSet = Parameters<StateCreator<State>>[0];
export type StoreGet = Parameters<StateCreator<State>>[1];
