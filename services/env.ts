type EnvKey =
  | 'EXPO_PUBLIC_SEARCH_API_KEY'
  | 'EXPO_PUBLIC_GEMINI_API_KEY'
  | 'EXPO_PUBLIC_ORS_API_KEY'
  | 'EXPO_PUBLIC_GEMINI_MODEL';

const getEnv = (key: EnvKey): string | null => {
  const value = process.env[key];

  if (!value) {
    console.warn(`${key} is not set. Add it to your .env file (see .env.example).`);
    return null;
  }

  return value;
};

export const SEARCH_API_KEY = getEnv('EXPO_PUBLIC_SEARCH_API_KEY');
export const GEMINI_API_KEY = getEnv('EXPO_PUBLIC_GEMINI_API_KEY');
export const ORS_API_KEY = getEnv('EXPO_PUBLIC_ORS_API_KEY');
export const GEMINI_MODEL = process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-1.5-flash';
