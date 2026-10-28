// Program ids are GUIDs (every mock file name, the API's Guid route). Any id
// from a URL is untrusted input: nothing else may reach a fetch or fs path.
// No React import here, so server modules (the program page) can use it too.
const PROGRAM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isProgramId = (value: string) => PROGRAM_ID.test(value)
