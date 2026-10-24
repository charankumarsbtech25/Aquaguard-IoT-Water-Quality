import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBwYEox3qFbYScyc13DYtCddwE8jbmY1KQ",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "iot-project-95a7a.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://iot-project-95a7a-default-rtdb.firebaseio.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "iot-project-95a7a",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "iot-project-95a7a.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "80050500064",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:80050500064:web:7f3eb263e63de57e7a3b85"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);