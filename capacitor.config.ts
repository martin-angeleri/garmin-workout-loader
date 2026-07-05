import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.martinangeleri.garminworkoutloader',
  appName: 'Garmin Workout Loader',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
