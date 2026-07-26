use std::env;
use std::error::Error;
use std::ffi::c_void;
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant};

use windows_capture::capture::{Context, GraphicsCaptureApiHandler};
use windows_capture::encoder::{
    AudioSettingsBuilder, ContainerSettingsBuilder, VideoEncoder, VideoSettingsBuilder,
};
use windows_capture::frame::Frame;
use windows_capture::graphics_capture_api::InternalCaptureControl;
use windows_capture::settings::{
    ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
    MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
};
use windows_capture::window::Window;

type RecorderError = Box<dyn Error + Send + Sync>;

#[link(name = "user32")]
unsafe extern "system" {
    fn RedrawWindow(
        hwnd: *mut c_void,
        update_rect: *const c_void,
        update_region: *mut c_void,
        flags: u32,
    ) -> i32;
}

const RDW_REFRESH_WINDOW_AND_CHILDREN: u32 = 0x0001 | 0x0080 | 0x0100;

struct Cli {
    hwnd: isize,
    output: PathBuf,
    stop_file: PathBuf,
    ready_file: PathBuf,
    frame_rate: u32,
    bitrate: u32,
    max_seconds: u64,
}

struct CaptureFlags {
    output: PathBuf,
    width: u32,
    height: u32,
    frame_rate: u32,
    bitrate: u32,
}

struct Capture {
    encoder: Option<VideoEncoder>,
    frames: u64,
}

impl Capture {
    fn finish(&mut self) -> Result<(), RecorderError> {
        if let Some(encoder) = self.encoder.take() {
            encoder.finish()?;
        }
        Ok(())
    }
}

impl GraphicsCaptureApiHandler for Capture {
    type Flags = CaptureFlags;
    type Error = RecorderError;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        let video_settings = VideoSettingsBuilder::new(ctx.flags.width, ctx.flags.height)
            .bitrate(ctx.flags.bitrate)
            .frame_rate(ctx.flags.frame_rate);
        let encoder = VideoEncoder::new(
            video_settings,
            AudioSettingsBuilder::default().disabled(true),
            ContainerSettingsBuilder::default(),
            ctx.flags.output,
        )?;
        Ok(Self {
            encoder: Some(encoder),
            frames: 0,
        })
    }

    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame,
        _capture_control: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        self.encoder
            .as_mut()
            .ok_or("Video encoder is unavailable")?
            .send_frame(frame)?;
        self.frames += 1;
        Ok(())
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> {
        self.finish()
    }
}

fn parse_cli() -> Result<Cli, RecorderError> {
    let args: Vec<String> = env::args().collect();
    let value = |name: &str| -> Result<String, RecorderError> {
        let index = args
            .iter()
            .position(|arg| arg == name)
            .ok_or_else(|| format!("Missing required argument {name}"))?;
        args.get(index + 1)
            .cloned()
            .ok_or_else(|| format!("Missing value for {name}").into())
    };

    Ok(Cli {
        hwnd: value("--hwnd")?.parse()?,
        output: PathBuf::from(value("--output")?),
        stop_file: PathBuf::from(value("--stop-file")?),
        ready_file: PathBuf::from(value("--ready-file")?),
        frame_rate: value("--frame-rate")?.parse()?,
        bitrate: value("--bitrate")?.parse()?,
        max_seconds: value("--max-seconds")?.parse()?,
    })
}

fn wait_for_first_frame(
    callback: &parking_lot::Mutex<Capture>,
    ready_file: &Path,
) -> Result<(), RecorderError> {
    let deadline = Instant::now() + Duration::from_secs(15);
    while Instant::now() < deadline {
        if callback.lock().frames > 0 {
            fs::write(ready_file, "ready\n")?;
            return Ok(());
        }
        thread::sleep(Duration::from_millis(100));
    }
    Err("Windows Graphics Capture did not produce a frame within 15 seconds".into())
}

fn main() -> Result<(), RecorderError> {
    let cli = parse_cli()?;
    if cli.hwnd <= 0 || cli.frame_rate == 0 || cli.max_seconds == 0 {
        return Err("Invalid capture arguments".into());
    }

    if let Some(parent) = cli.output.parent() {
        fs::create_dir_all(parent)?;
    }
    let _ = fs::remove_file(&cli.stop_file);
    let _ = fs::remove_file(&cli.ready_file);
    let _ = fs::remove_file(&cli.output);

    let window = Window::from_raw_hwnd(cli.hwnd as *mut c_void);
    let rect = window.rect()?;
    let width = u32::try_from(rect.right - rect.left)?;
    let height = u32::try_from(rect.bottom - rect.top)?;
    if width < 320 || height < 240 {
        return Err(format!("Invalid capture size {width}x{height}").into());
    }

    let settings = Settings::new(
        window,
        CursorCaptureSettings::WithCursor,
        DrawBorderSettings::WithoutBorder,
        SecondaryWindowSettings::Exclude,
        MinimumUpdateIntervalSettings::Custom(Duration::from_millis(
            1000 / u64::from(cli.frame_rate),
        )),
        DirtyRegionSettings::Default,
        ColorFormat::Bgra8,
        CaptureFlags {
            output: cli.output.clone(),
            width,
            height,
            frame_rate: cli.frame_rate,
            bitrate: cli.bitrate,
        },
    );

    let control = Capture::start_free_threaded(settings)?;
    let callback = control.callback();
    wait_for_first_frame(&callback, &cli.ready_file)?;

    let deadline = Instant::now() + Duration::from_secs(cli.max_seconds);
    while !cli.stop_file.exists() && Instant::now() < deadline && !control.is_finished() {
        unsafe {
            RedrawWindow(
                cli.hwnd as *mut c_void,
                std::ptr::null(),
                std::ptr::null_mut(),
                RDW_REFRESH_WINDOW_AND_CHILDREN,
            );
        }
        thread::sleep(Duration::from_millis(100));
    }

    unsafe {
        RedrawWindow(
            cli.hwnd as *mut c_void,
            std::ptr::null(),
            std::ptr::null_mut(),
            RDW_REFRESH_WINDOW_AND_CHILDREN,
        );
    }
    thread::sleep(Duration::from_millis(150));
    callback.lock().finish()?;
    control.stop()?;
    Ok(())
}
