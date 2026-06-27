import { ApiService } from './api.js';

// Sync materi Moodle biasanya lebih lama dari request chat biasa.
// Default 180 detik (sync materi bisa ~1-2 menit; indeks siswa jadi request terpisah).
// Bisa dioverride lewat FE env: PUBLIC_MOODLE_SYNC_TIMEOUT_MS=180000
const MOODLE_SYNC_TIMEOUT_MS = Number(import.meta.env.PUBLIC_MOODLE_SYNC_TIMEOUT_MS || 180000);

export const MoodleApi = {
  getConfig(projectId) {
    return ApiService.fetch(`/moodle/config?projectId=${projectId}`);
  },
  saveConfig(payload) {
    return ApiService.fetch('/moodle/config', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  testConnection(payload) {
    return ApiService.fetch('/moodle/test', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  previewCourseMap(payload) {
    return ApiService.fetch('/moodle/courses/preview-map', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  syncCourseMap(payload) {
    return ApiService.fetch('/moodle/courses/sync-map', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  getCourseContents(projectId, courseId) {
    return ApiService.fetch(`/moodle/course-contents?projectId=${projectId}&courseId=${courseId}`);
  },
  syncCourse(payload) {
    return ApiService.fetch('/moodle/sync/course', {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: MOODLE_SYNC_TIMEOUT_MS
    });
  },
  syncAllCourses(payload) {
    return ApiService.fetch('/moodle/sync/all', {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: MOODLE_SYNC_TIMEOUT_MS
    });
  },
  // [v0.9.40.1] Indeks siswa — request TERPISAH (punya timeout sendiri) agar tak ikut
  // memperlambat/timeout sync materi.
  syncStudents(payload) {
    return ApiService.fetch('/moodle/sync/students', {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: MOODLE_SYNC_TIMEOUT_MS
    });
  }
};
