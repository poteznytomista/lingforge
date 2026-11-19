//! Project storage is independent of Tauri. All public operations are serialized
//! by the desktop service; a filesystem lock excludes other LingForge instances.
mod archive;
mod catalog;
mod database;
pub mod lexicon;
pub mod lexicon_transfer;
pub mod notebook;
pub mod phonology;
mod project;
pub mod writing;

pub use archive::import_project;
pub use catalog::{Catalog, RecentProject};
pub use project::{BackupInfo, Project};

use lingforge_core::{AppError, ErrorCode};
use std::{
    fs,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

pub type Result<T> = std::result::Result<T, AppError>;

pub(crate) fn io(error: std::io::Error) -> AppError {
    let message = match error.kind() {
        std::io::ErrorKind::PermissionDenied => "Permission denied. Choose a writable location.",
        std::io::ErrorKind::NotFound => "The selected file or folder is missing.",
        std::io::ErrorKind::AlreadyExists => {
            "The destination already exists. Choose a new location."
        }
        _ => "A file operation failed. Check free space, permissions, and the selected location.",
    };
    AppError::new(ErrorCode::Io, message)
}

pub(crate) fn sql(_: rusqlite::Error) -> AppError {
    AppError::new(
        ErrorCode::Io,
        "The database operation failed. Your last committed save is preserved.",
    )
}

pub(crate) fn invalid(message: &str) -> AppError {
    AppError::new(ErrorCode::InvalidProject, message)
}

pub(crate) fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}

pub(crate) fn regular_file(path: &Path) -> Result<()> {
    if !fs::symlink_metadata(path)
        .map_err(io)?
        .file_type()
        .is_file()
    {
        return Err(invalid(
            "Project files must be regular files, not links or directories.",
        ));
    }
    Ok(())
}

pub(crate) fn plain_directory(path: &Path) -> Result<()> {
    if !fs::symlink_metadata(path).map_err(io)?.file_type().is_dir() {
        return Err(invalid("Select a regular directory, not a symbolic link."));
    }
    Ok(())
}

// Syncing the parent directory improves rename durability on Unix. Windows does
// not expose the equivalent through File::open; SQLite still uses FULL syncing.
pub(crate) fn sync_directory(path: &Path) -> Result<()> {
    #[cfg(unix)]
    fs::File::open(path).map_err(io)?.sync_all().map_err(io)?;
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
}

pub mod automation;
pub mod fonts;
