import { app, shell, BrowserWindow, protocol, net, session } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import { registerSettingsHandlers } from './ipc/settings.ipc'
import { registerJobsHandlers } from './ipc/jobs.ipc'
import { registerAssetsHandlers } from './ipc/assets.ipc'
import { ProjectStore } from './services/storage/project-store'
import { filePathFromMediaUrl, isPathInside } from './services/files/path-safety'

// Register schemes as privileged before app is ready
// NOTE: bypassCSP is intentionally omitted — the handler restricts paths to
// project directories, so CSP enforcement must remain active.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
])

function getContentSecurityPolicy(): string {
  if (is.dev) {
    return (
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com; " +
      "font-src 'self' data: https://fonts.gstatic.com https://cdn.fontshare.com; " +
      "img-src 'self' data: media: https://images.pexels.com https://lh3.googleusercontent.com; " +
      "media-src 'self' media:; " +
      "connect-src 'self' ws://127.0.0.1:* ws://localhost:* http://127.0.0.1:* http://localhost:*;"
    )
  }

  return (
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com; " +
    "font-src 'self' data: https://fonts.gstatic.com https://cdn.fontshare.com; " +
    "img-src 'self' data: media: https://images.pexels.com https://lh3.googleusercontent.com; " +
    "media-src 'self' media:; " +
    "connect-src 'none';"
  )
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const target = new URL(details.url)
      if (target.protocol === 'https:' || target.protocol === 'http:') {
        shell.openExternal(target.toString())
      }
    } catch {
      // Ignore malformed URLs from renderer content.
    }
    return { action: 'deny' }
  })

  // Block in-window navigation away from the app origin. Without this, a
  // compromised or navigated page would retain the preload bridge (window.api).
  const allowedOrigins = new Set<string>()
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    try {
      allowedOrigins.add(new URL(process.env['ELECTRON_RENDERER_URL']).origin)
    } catch {
      // Fall through — production file:// path still applies below.
    }
  }

  const isAllowedNavigation = (url: string): boolean => {
    try {
      const target = new URL(url)
      if (target.protocol === 'file:') {
        return true
      }
      return allowedOrigins.has(target.origin)
    } catch {
      return false
    }
  }

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault()
    }
  })

  mainWindow.webContents.on('will-redirect', (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault()
    }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Register media protocol to serve local files securely
  protocol.handle('media', async (request) => {
    try {
      const decodedPath = filePathFromMediaUrl(request.url)
      if (!decodedPath) {
        return new Response('Invalid media path', { status: 400 })
      }

      const projects = await ProjectStore.list()
      const isProjectMedia = projects.some((project) =>
        isPathInside(project.downloadPath, decodedPath)
      )

      if (!isProjectMedia) {
        return new Response('Media path is outside project folders', { status: 403 })
      }

      return net.fetch(pathToFileURL(decodedPath).toString())
    } catch {
      return new Response('Unable to load media', { status: 400 })
    }
  })

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.eact6.stockfinder-ai')

  // Set authoritative Content-Security-Policy headers at the session level.
  // This is the recommended approach for Electron — the meta-tag CSP in index.html
  // is a defence-in-depth layer but session-level headers take precedence.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [getContentSecurityPolicy()]
      }
    })
  })

  // Register IPC Handlers
  registerSettingsHandlers()
  registerJobsHandlers()
  registerAssetsHandlers()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
