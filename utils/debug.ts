/** Global flag controlling debug logging and behavior. */
export let isDebugMode = false;

/**
 * Sets the global debug mode flag.
 * @param v - The new debug mode value.
 */
export function setDebugMode(v: boolean) {
    isDebugMode = v;
}
