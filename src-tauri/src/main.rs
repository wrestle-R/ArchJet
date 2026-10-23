#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::os::unix::process::CommandExt;
use std::{
    io::Write,
    process::{Command, Stdio},
    sync::Arc,
};
use tauri::Manager;
struct Backend {
    root: std::path::PathBuf,
}
#[tauri::command]
async fn call(
    action: String,
    payload: serde_json::Value,
    state: tauri::State<'_, Arc<Backend>>,
) -> Result<serde_json::Value, String> {
    let root = state.root.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut child = Command::new("/usr/bin/python3")
            .arg(root.join("engine.py"))
            .arg(&root)
            .arg(&action)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?;
        child
            .stdin
            .take()
            .ok_or("Backend input unavailable")?
            .write_all(payload.to_string().as_bytes())
            .map_err(|e| e.to_string())?;
        let result = child.wait_with_output().map_err(|e| e.to_string())?;
        let value: serde_json::Value = serde_json::from_slice(&result.stdout)
            .map_err(|_| "Printing service returned an invalid response".to_string())?;
        if let Some(error) = value.get("error").and_then(|v| v.as_str()) {
            Err(error.to_string())
        } else {
            Ok(value)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn choose_files(folder: bool) -> Vec<String> {
    let picker = rfd::AsyncFileDialog::new().set_title(if folder {
        "Choose a document folder"
    } else {
        "Add documents"
    });
    if folder {
        picker
            .pick_folder()
            .await
            .into_iter()
            .map(|f| f.path().to_string_lossy().into_owned())
            .collect()
    } else {
        picker
            .add_filter(
                "Documents",
                &[
                    "pdf", "docx", "doc", "odt", "rtf", "pptx", "xlsx", "png", "jpg", "jpeg",
                    "tif", "tiff", "webp",
                ],
            )
            .pick_files()
            .await
            .unwrap_or_default()
            .iter()
            .map(|f| f.path().to_string_lossy().into_owned())
            .collect()
    }
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            use std::os::unix::fs::PermissionsExt;
            let root = std::env::temp_dir().join(format!("print-arch-{}", std::process::id()));
            std::fs::create_dir(&root)?;
            std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700))?;
            std::fs::write(
                root.join("engine.py"),
                include_str!("../../backend/engine.py"),
            )?;
            let mut startup = Command::new("/usr/bin/python3")
                .arg(root.join("engine.py"))
                .arg(&root)
                .arg("startup")
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .spawn()?;
            startup.stdin.take().unwrap().write_all(b"{}")?;
            let startup_result = startup.wait_with_output()?;
            if !startup_result.status.success() {
                let detail = String::from_utf8_lossy(&startup_result.stdout);
                std::fs::write(
                    root.join("recovery-error.txt"),
                    format!("Previous-session cleanup failed: {detail}"),
                )?;
            }
            Command::new("/usr/bin/python3")
                .arg(root.join("engine.py"))
                .arg(&root)
                .arg("--watch")
                .arg(std::process::id().to_string())
                .process_group(0)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()?;
            app.manage(Arc::new(Backend { root }));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![call, choose_files])
        .run(tauri::generate_context!())
        .expect("Unable to start Print Arch");
}
