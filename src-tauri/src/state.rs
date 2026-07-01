//! Shared application state: the running-job registry (for cancellation)
//! and a concurrency limiter.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tokio::sync::{Notify, Semaphore};

/// Maximum number of conversions running at once.
const MAX_CONCURRENCY: usize = 2;

pub struct AppState {
    /// job id -> cancel signal. Present only while a job is running.
    jobs: Mutex<HashMap<String, Arc<Notify>>>,
    /// OS wake-lock held only while compression is running and the pref is on.
    wake_lock: Mutex<Option<keepawake::KeepAwake>>,
    /// Limits how many FFmpeg processes run concurrently.
    pub sem: Arc<Semaphore>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            jobs: Mutex::new(HashMap::new()),
            wake_lock: Mutex::new(None),
            sem: Arc::new(Semaphore::new(MAX_CONCURRENCY)),
        }
    }

    pub fn register(&self, id: &str, cancel: Arc<Notify>) {
        self.jobs.lock().unwrap().insert(id.to_string(), cancel);
    }

    pub fn unregister(&self, id: &str) {
        self.jobs.lock().unwrap().remove(id);
    }

    /// Signal a single running job to cancel. Returns true if it was found.
    pub fn cancel(&self, id: &str) -> bool {
        match self.jobs.lock().unwrap().get(id) {
            Some(n) => {
                n.notify_one();
                true
            }
            None => false,
        }
    }

    /// Signal every running job to cancel.
    pub fn cancel_all(&self) {
        for n in self.jobs.lock().unwrap().values() {
            n.notify_one();
        }
    }

    pub fn set_prevent_sleep(&self, enabled: bool) -> Result<(), String> {
        let mut lock = self.wake_lock.lock().unwrap();
        if enabled {
            if lock.is_some() {
                return Ok(());
            }
            let awake = keepawake::Builder::default()
                // Let the display follow the user's normal dim/lock settings.
                .display(false)
                .idle(true)
                .sleep(true)
                .reason("Formatif compression")
                .app_name("Formatif")
                .app_reverse_domain("app.formatif.desktop")
                .create()
                .or_else(|_| {
                    keepawake::Builder::default()
                        .display(false)
                        .idle(true)
                        .reason("Formatif compression")
                        .app_name("Formatif")
                        .app_reverse_domain("app.formatif.desktop")
                        .create()
                })
                .map_err(|e| e.to_string())?;
            *lock = Some(awake);
        } else {
            *lock = None;
        }
        Ok(())
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
