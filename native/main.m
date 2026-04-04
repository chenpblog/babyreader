@import Cocoa;
@import WebKit;
@import CoreServices;
@import UniformTypeIdentifiers;

// ---------------------------------------------------------------------------
// Forward declarations
// ---------------------------------------------------------------------------

@class BRWindowController;

// ---------------------------------------------------------------------------
// MARK: - AppDelegate interface
// ---------------------------------------------------------------------------

@interface AppDelegate : NSObject <NSApplicationDelegate>
@property (strong) NSMutableArray<BRWindowController *> *controllers;
- (BRWindowController *)createNewWindow;
- (BRWindowController *)activeController;
- (void)removeController:(BRWindowController *)wc;
@end

// ---------------------------------------------------------------------------
// MARK: - BRWindowController interface
// ---------------------------------------------------------------------------

@interface BRWindowController : NSObject <WKScriptMessageHandler, WKNavigationDelegate, NSWindowDelegate>
@property (strong) NSWindow     *window;
@property (strong) WKWebView    *webView;
@property (strong) NSURL        *currentFileURL;
@property (assign) BOOL          webReady;
@property (strong) NSDictionary *pendingDocument;
@property (weak)   AppDelegate  *appDelegate;

- (instancetype)initWithAppDelegate:(AppDelegate *)delegate;
- (void)openFileAtURL:(NSURL *)url;

// Menu actions — called by AppDelegate routing
- (void)menuOpen:(id)sender;
- (void)menuSave:(id)sender;
- (void)menuSaveAs:(id)sender;
- (void)menuToggleEditMode:(id)sender;
- (void)menuZoomIn:(id)sender;
- (void)menuZoomOut:(id)sender;
- (void)menuZoomReset:(id)sender;
@end

// ---------------------------------------------------------------------------
// MARK: - BRWindowController implementation
// ---------------------------------------------------------------------------

@implementation BRWindowController

- (instancetype)initWithAppDelegate:(AppDelegate *)delegate {
  self = [super init];
  if (self) {
    _appDelegate = delegate;
    [self createWindowAndWebView];
    [self loadWebContent];
  }
  return self;
}

// ---------------------------------------------------------------------------
// MARK: Window + WebView setup

- (void)createWindowAndWebView {
  NSUInteger styleMask = NSWindowStyleMaskTitled          |
                         NSWindowStyleMaskClosable        |
                         NSWindowStyleMaskMiniaturizable  |
                         NSWindowStyleMaskResizable;

  // Restore last saved frame, or default to full visible-screen height
  NSRect initialFrame;
  NSString *savedFrame = [[NSUserDefaults standardUserDefaults] stringForKey:@"BRWindowFrame"];
  if (savedFrame) {
    NSRect restored = NSRectFromString(savedFrame);
    // Sanity check: frame must intersect at least one screen
    BOOL valid = NO;
    for (NSScreen *s in [NSScreen screens]) {
      if (NSIntersectsRect(restored, s.frame)) { valid = YES; break; }
    }
    initialFrame = valid ? restored : NSZeroRect;
  }
  if (NSIsEmptyRect(initialFrame)) {
    NSRect screen = [[NSScreen mainScreen] visibleFrame];
    CGFloat width = MIN(1200.0, screen.size.width * 0.88);
    initialFrame = NSMakeRect(
      screen.origin.x + floor((screen.size.width - width) / 2.0),
      screen.origin.y,
      width,
      screen.size.height
    );
  }

  self.window = [[NSWindow alloc] initWithContentRect:initialFrame
                                            styleMask:styleMask
                                              backing:NSBackingStoreBuffered
                                                defer:NO];
  self.window.minSize                    = NSMakeSize(800, 600);
  self.window.appearance                 = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
  self.window.titleVisibility            = NSWindowTitleHidden;
  self.window.titlebarAppearsTransparent = YES;
  self.window.movableByWindowBackground  = YES;
  self.window.title                      = @"BabyReader";
  self.window.tabbingMode                = NSWindowTabbingModeAutomatic;
  self.window.delegate                   = self;

  // WKWebView configuration
  WKWebViewConfiguration *config = [[WKWebViewConfiguration alloc] init];

  WKWebpagePreferences *pagePrefs = [[WKWebpagePreferences alloc] init];
  pagePrefs.allowsContentJavaScript = YES;
  config.defaultWebpagePreferences = pagePrefs;

  WKUserContentController *ucc = [[WKUserContentController alloc] init];
  [ucc addScriptMessageHandler:self name:@"native"];
  config.userContentController = ucc;

  self.webView = [[WKWebView alloc] initWithFrame:self.window.contentView.bounds
                                    configuration:config];
  self.webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  self.webView.navigationDelegate = self;
  self.webView.allowsMagnification = NO;
  [self.window.contentView addSubview:self.webView];

  [self.window makeKeyAndOrderFront:nil];
}

// ---------------------------------------------------------------------------
// MARK: Web content loading

- (void)loadWebContent {
  NSURL *indexURL  = [[NSBundle mainBundle] URLForResource:@"index"
                                              withExtension:@"html"
                                               subdirectory:@"web"];
  NSURL *webDirURL = [[NSBundle mainBundle] URLForResource:@"web"
                                             withExtension:nil];
  if (!indexURL || !webDirURL) {
    [self showError:@"Missing Resources"
             detail:@"Could not find Resources/web/index.html in the app bundle."];
    return;
  }
  [self.webView loadFileURL:indexURL allowingReadAccessToURL:webDirURL];
}

// ---------------------------------------------------------------------------
// MARK: WKScriptMessageHandler — web → native bridge

- (void)userContentController:(WKUserContentController *)ucc
      didReceiveScriptMessage:(WKScriptMessage *)message {

  if (![message.body isKindOfClass:[NSDictionary class]]) return;
  NSDictionary *body    = (NSDictionary *)message.body;
  NSString     *type    = body[@"type"];
  NSDictionary *payload = [body[@"payload"] isKindOfClass:[NSDictionary class]]
                            ? body[@"payload"] : @{};

  if ([type isEqualToString:@"ready"]) {
    self.webReady = YES;
    if (self.pendingDocument) {
      [self sendFunction:@"receiveDocument" payload:self.pendingDocument];
      self.pendingDocument = nil;
    }
    return;
  }

  if ([type isEqualToString:@"open"]) {
    [self menuOpen:nil];
    return;
  }

  if ([type isEqualToString:@"save"]) {
    [self menuSave:nil];
    return;
  }

  if ([type isEqualToString:@"saveAs"]) {
    [self menuSaveAs:nil];
    return;
  }

  if ([type isEqualToString:@"copyText"]) {
    NSString *text = payload[@"text"];
    if ([text isKindOfClass:[NSString class]] && text.length) {
      NSPasteboard *pb = [NSPasteboard generalPasteboard];
      [pb clearContents];
      [pb setString:text forType:NSPasteboardTypeString];
    }
    return;
  }

  (void)payload;
}

// ---------------------------------------------------------------------------
// MARK: WKNavigationDelegate

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
  // Web layer sends "ready" when fully initialized.
}

- (void)webView:(WKWebView *)webView
    decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction
                    decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
  NSURL *url = navigationAction.request.URL;

  // Allow local file loads (initial page load)
  if ([url isFileURL]) {
    decisionHandler(WKNavigationActionPolicyAllow);
    return;
  }

  // For any external URL (http/https), open in default browser
  if ([url.scheme isEqualToString:@"http"] || [url.scheme isEqualToString:@"https"]) {
    [[NSWorkspace sharedWorkspace] openURL:url];
    decisionHandler(WKNavigationActionPolicyCancel);
    return;
  }

  decisionHandler(WKNavigationActionPolicyAllow);
}

// ---------------------------------------------------------------------------
// MARK: NSWindowDelegate

- (void)windowWillClose:(NSNotification *)notification {
  [self.appDelegate removeController:self];
}

- (void)windowDidResize:(NSNotification *)notification {
  [self persistWindowFrame];
}

- (void)windowDidMove:(NSNotification *)notification {
  [self persistWindowFrame];
}

- (void)persistWindowFrame {
  // Don't save full-screen or zoomed state
  if (self.window.styleMask & NSWindowStyleMaskFullScreen) return;
  if (self.window.isZoomed) return;
  [[NSUserDefaults standardUserDefaults]
    setObject:NSStringFromRect(self.window.frame)
       forKey:@"BRWindowFrame"];
}

// ---------------------------------------------------------------------------
// MARK: File operations

- (NSArray<UTType *> *)supportedTypes {
  return @[
    [UTType typeWithFilenameExtension:@"md"],
    [UTType typeWithFilenameExtension:@"markdown"],
    [UTType typeWithFilenameExtension:@"epub"],
    UTTypePlainText
  ];
}

- (void)openFileAtURL:(NSURL *)url {
  NSString *ext = url.pathExtension.lowercaseString;

  self.currentFileURL        = url;
  self.window.title          = url.lastPathComponent;
  self.window.representedURL = url;

  if ([ext isEqualToString:@"epub"]) {
    // Read binary file and base64 encode for the web layer
    NSError *error = nil;
    NSData  *data  = [NSData dataWithContentsOfURL:url options:0 error:&error];
    if (!data) {
      [self showError:@"Cannot Open File"
               detail:error.localizedDescription ?: @"Unknown error reading the file."];
      return;
    }
    NSString *base64 = [data base64EncodedStringWithOptions:0];
    NSDictionary *doc = @{
      @"path":     url.path,
      @"name":     url.lastPathComponent,
      @"type":     @"epub",
      @"data":     base64
    };
    if (self.webReady) {
      [self sendFunction:@"receiveDocument" payload:doc];
    } else {
      self.pendingDocument = doc;
    }
  } else {
    // Text file (md, txt, markdown)
    NSError  *error   = nil;
    NSString *content = [NSString stringWithContentsOfURL:url
                                             usedEncoding:NULL
                                                    error:&error];
    if (!content) {
      [self showError:@"Cannot Open File"
               detail:error.localizedDescription ?: @"Unknown error reading the file."];
      return;
    }
    NSDictionary *doc = @{
      @"path":    url.path,
      @"name":    url.lastPathComponent,
      @"type":    @"text",
      @"content": content
    };
    if (self.webReady) {
      [self sendFunction:@"receiveDocument" payload:doc];
    } else {
      self.pendingDocument = doc;
    }
  }
}

// ---------------------------------------------------------------------------
// MARK: Menu actions

- (void)menuOpen:(id)sender {
  NSOpenPanel *panel = [NSOpenPanel openPanel];
  panel.canChooseFiles          = YES;
  panel.canChooseDirectories    = NO;
  panel.allowsMultipleSelection = NO;
  panel.allowedContentTypes     = [self supportedTypes];

  if ([panel runModal] == NSModalResponseOK) {
    // Reuse this window when the user explicitly opens from within it.
    [self openFileAtURL:panel.URL];
  }
}

- (void)menuSave:(id)sender {
  if (!self.currentFileURL) {
    [self menuSaveAs:sender];
    return;
  }
  __weak typeof(self) weakSelf = self;
  [self fetchContentFromWeb:^(NSString *content) {
    [weakSelf writeContent:content toURL:weakSelf.currentFileURL];
  }];
}

- (void)menuSaveAs:(id)sender {
  NSSavePanel *panel = [NSSavePanel savePanel];
  panel.canCreateDirectories  = YES;
  panel.allowedContentTypes   = [self supportedTypes];
  panel.nameFieldStringValue  = self.currentFileURL.lastPathComponent ?: @"Untitled.md";

  if ([panel runModal] == NSModalResponseOK) {
    NSURL *target = panel.URL;
    __weak typeof(self) weakSelf = self;
    [self fetchContentFromWeb:^(NSString *content) {
      [weakSelf writeContent:content toURL:target];
      weakSelf.currentFileURL        = target;
      weakSelf.window.title          = target.lastPathComponent;
      weakSelf.window.representedURL = target;
      // Notify web layer so its state stays in sync
      [weakSelf sendFunction:@"notifySaved" payload:@{
        @"path": target.path,
        @"name": target.lastPathComponent
      }];
    }];
  }
}

- (void)menuToggleEditMode:(id)sender {
  [self callWebFunction:@"toggleEditMode"];
}

- (void)menuZoomIn:(id)sender {
  [self callWebFunction:@"zoomIn"];
}

- (void)menuZoomOut:(id)sender {
  [self callWebFunction:@"zoomOut"];
}

- (void)menuZoomReset:(id)sender {
  [self callWebFunction:@"zoomReset"];
}

// ---------------------------------------------------------------------------
// MARK: Save helpers

- (void)fetchContentFromWeb:(void (^)(NSString *content))completion {
  NSString *script = @"window.appHost && typeof window.appHost.getContent === 'function' "
                      @"? window.appHost.getContent() : null;";
  [self.webView evaluateJavaScript:script completionHandler:^(id result, NSError *error) {
    NSString *content = [result isKindOfClass:[NSString class]] ? result : @"";
    completion(content);
  }];
}

- (void)writeContent:(NSString *)content toURL:(NSURL *)url {
  NSError *error = nil;
  BOOL ok = [content writeToURL:url atomically:YES encoding:NSUTF8StringEncoding error:&error];
  if (!ok) {
    [self showError:@"Save Failed"
             detail:error.localizedDescription ?: @"Unknown error writing the file."];
    return;
  }
  // Basic save notification (path/name update is sent separately in saveAs)
  [self sendFunction:@"notifySaved" payload:@{
    @"path": url.path,
    @"name": url.lastPathComponent
  }];
}

// ---------------------------------------------------------------------------
// MARK: Native → Web bridge helpers

- (void)sendFunction:(NSString *)function payload:(id)payload {
  if (!self.webReady || !function.length) return;

  NSError *error = nil;
  NSData  *data  = [NSJSONSerialization dataWithJSONObject:payload options:0 error:&error];
  if (!data) { NSLog(@"[BabyReader] JSON serialization error: %@", error); return; }

  NSString *json   = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  NSString *script = [NSString stringWithFormat:
    @"if (window.appHost && typeof window.appHost.%@ === 'function') { window.appHost.%@(%@); }",
    function, function, json];

  [self evaluateJS:script];
}

- (void)callWebFunction:(NSString *)function {
  if (!self.webReady || !function.length) return;
  NSString *script = [NSString stringWithFormat:
    @"if (window.appHost && typeof window.appHost.%@ === 'function') { window.appHost.%@(); }",
    function, function];
  [self evaluateJS:script];
}

- (void)evaluateJS:(NSString *)script {
  [self.webView evaluateJavaScript:script completionHandler:^(id result, NSError *error) {
    if (error) NSLog(@"[BabyReader] JS error: %@", error.localizedDescription);
  }];
}

// ---------------------------------------------------------------------------
// MARK: Utilities

- (void)showError:(NSString *)title detail:(NSString *)detail {
  NSAlert *alert        = [[NSAlert alloc] init];
  alert.messageText     = title;
  alert.informativeText = detail;
  alert.alertStyle      = NSAlertStyleWarning;
  [alert addButtonWithTitle:@"OK"];
  [alert runModal];
}

@end

// ---------------------------------------------------------------------------
// MARK: - AppDelegate implementation
// ---------------------------------------------------------------------------

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];

  self.controllers = [NSMutableArray array];

  // Register as default handler for Markdown files
  NSString *bundleID = [[NSBundle mainBundle] bundleIdentifier];
  if (bundleID) {
    LSSetDefaultRoleHandlerForContentType(
      (__bridge CFStringRef)@"net.daringfireball.markdown",
      kLSRolesAll,
      (__bridge CFStringRef)bundleID
    );
    LSSetDefaultRoleHandlerForContentType(
      (__bridge CFStringRef)@"org.idpf.epub-container",
      kLSRolesAll,
      (__bridge CFStringRef)bundleID
    );
  }

  [self buildMenuBar];

  [NSApp activateIgnoringOtherApps:YES];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
  return YES;
}

// Called only when the app launches with no file arguments — show welcome window
- (BOOL)applicationOpenUntitledFile:(NSApplication *)sender {
  [self createNewWindow];
  return YES;
}

// Called by Finder / double-click (legacy path)
- (void)application:(NSApplication *)sender openFiles:(NSArray<NSString *> *)filenames {
  for (NSString *path in filenames) {
    BRWindowController *wc = [self reuseOrCreateWindow];
    [wc openFileAtURL:[NSURL fileURLWithPath:path]];
  }
  [sender replyToOpenOrPrint:NSApplicationDelegateReplySuccess];
}

// Called on modern macOS (10.13+)
- (void)application:(NSApplication *)application openURLs:(NSArray<NSURL *> *)urls {
  for (NSURL *url in urls) {
    BRWindowController *wc = [self reuseOrCreateWindow];
    [wc openFileAtURL:url];
  }
}

// ---------------------------------------------------------------------------
// MARK: Window management

- (BRWindowController *)createNewWindow {
  BRWindowController *wc = [[BRWindowController alloc] initWithAppDelegate:self];
  [self.controllers addObject:wc];
  return wc;
}

- (BRWindowController *)reuseOrCreateWindow {
  // Reuse an existing window that has no file loaded (welcome screen)
  for (BRWindowController *wc in self.controllers) {
    if (!wc.currentFileURL) return wc;
  }
  return [self createNewWindow];
}

- (void)removeController:(BRWindowController *)wc {
  [self.controllers removeObject:wc];
}

- (BRWindowController *)activeController {
  NSWindow *key = [NSApp keyWindow];
  for (BRWindowController *wc in self.controllers) {
    if (wc.window == key) return wc;
  }
  return self.controllers.firstObject;
}

// ---------------------------------------------------------------------------
// MARK: Menu action routing (AppDelegate receives menu actions, routes to key window)

- (void)menuOpen:(id)sender {
  BRWindowController *wc = [self activeController];
  if (wc) {
    [wc menuOpen:sender];
  } else {
    wc = [self createNewWindow];
    // Web layer not ready yet; menuOpen will run after the user picks a file,
    // so it's fine to call immediately — the open panel blocks.
    [wc menuOpen:sender];
  }
}

- (void)menuSave:(id)sender {
  [[self activeController] menuSave:sender];
}

- (void)menuSaveAs:(id)sender {
  [[self activeController] menuSaveAs:sender];
}

- (void)menuToggleEditMode:(id)sender {
  [[self activeController] menuToggleEditMode:sender];
}

- (void)menuZoomIn:(id)sender {
  [[self activeController] menuZoomIn:sender];
}

- (void)menuZoomOut:(id)sender {
  [[self activeController] menuZoomOut:sender];
}

- (void)menuZoomReset:(id)sender {
  [[self activeController] menuZoomReset:sender];
}

- (void)menuNewTab:(id)sender {
  [self createNewWindow];
}

// ---------------------------------------------------------------------------
// MARK: Menu bar

- (void)buildMenuBar {
  NSMenu *bar = [[NSMenu alloc] init];
  [NSApp setMainMenu:bar];

  // ---- App menu ----
  NSString *appName = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleName"] ?: @"BabyReader";
  NSMenuItem *appRoot = [bar addItemWithTitle:@"" action:nil keyEquivalent:@""];
  NSMenu *appMenu = [[NSMenu alloc] initWithTitle:appName];
  appRoot.submenu = appMenu;
  [appMenu addItemWithTitle:[NSString stringWithFormat:@"Quit %@", appName]
                    action:@selector(terminate:)
             keyEquivalent:@"q"];

  // ---- File menu ----
  NSMenuItem *fileRoot = [bar addItemWithTitle:@"File" action:nil keyEquivalent:@""];
  NSMenu *fileMenu = [[NSMenu alloc] initWithTitle:@"File"];
  fileRoot.submenu = fileMenu;

  NSMenuItem *openItem = [[NSMenuItem alloc] initWithTitle:@"Open..."
                                                    action:@selector(menuOpen:)
                                             keyEquivalent:@"o"];
  openItem.target = self;
  [fileMenu addItem:openItem];

  NSMenuItem *newTabItem = [[NSMenuItem alloc] initWithTitle:@"New Tab"
                                                      action:@selector(menuNewTab:)
                                               keyEquivalent:@"t"];
  newTabItem.target = self;
  [fileMenu addItem:newTabItem];

  [fileMenu addItem:[NSMenuItem separatorItem]];

  NSMenuItem *saveItem = [[NSMenuItem alloc] initWithTitle:@"Save"
                                                    action:@selector(menuSave:)
                                             keyEquivalent:@"s"];
  saveItem.target = self;
  [fileMenu addItem:saveItem];

  NSMenuItem *saveAsItem = [[NSMenuItem alloc] initWithTitle:@"Save As..."
                                                      action:@selector(menuSaveAs:)
                                               keyEquivalent:@"S"];
  saveAsItem.keyEquivalentModifierMask = NSEventModifierFlagCommand | NSEventModifierFlagShift;
  saveAsItem.target = self;
  [fileMenu addItem:saveAsItem];

  // ---- Edit menu ----
  NSMenuItem *editRoot = [bar addItemWithTitle:@"Edit" action:nil keyEquivalent:@""];
  NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"Edit"];
  editRoot.submenu = editMenu;

  // Standard editing commands — target = nil so they go through the responder chain
  // (WKWebView / textarea will handle them naturally)
  [editMenu addItemWithTitle:@"Undo" action:@selector(undo:) keyEquivalent:@"z"];
  [editMenu addItemWithTitle:@"Redo" action:@selector(redo:) keyEquivalent:@"Z"];
  [editMenu addItem:[NSMenuItem separatorItem]];
  [editMenu addItemWithTitle:@"Cut" action:@selector(cut:) keyEquivalent:@"x"];
  [editMenu addItemWithTitle:@"Copy" action:@selector(copy:) keyEquivalent:@"c"];
  [editMenu addItemWithTitle:@"Paste" action:@selector(paste:) keyEquivalent:@"v"];
  [editMenu addItemWithTitle:@"Select All" action:@selector(selectAll:) keyEquivalent:@"a"];

  [editMenu addItem:[NSMenuItem separatorItem]];

  NSMenuItem *toggleEditItem = [[NSMenuItem alloc] initWithTitle:@"Toggle Edit Mode"
                                                          action:@selector(menuToggleEditMode:)
                                                   keyEquivalent:@"e"];
  toggleEditItem.target = self;
  [editMenu addItem:toggleEditItem];

  // ---- View menu ----
  NSMenuItem *viewRoot = [bar addItemWithTitle:@"View" action:nil keyEquivalent:@""];
  NSMenu *viewMenu = [[NSMenu alloc] initWithTitle:@"View"];
  viewRoot.submenu = viewMenu;

  NSMenuItem *zoomInItem = [[NSMenuItem alloc] initWithTitle:@"Zoom In"
                                                      action:@selector(menuZoomIn:)
                                               keyEquivalent:@"="];
  zoomInItem.target = self;
  [viewMenu addItem:zoomInItem];

  NSMenuItem *zoomOutItem = [[NSMenuItem alloc] initWithTitle:@"Zoom Out"
                                                       action:@selector(menuZoomOut:)
                                                keyEquivalent:@"-"];
  zoomOutItem.target = self;
  [viewMenu addItem:zoomOutItem];

  NSMenuItem *zoomResetItem = [[NSMenuItem alloc] initWithTitle:@"Actual Size"
                                                         action:@selector(menuZoomReset:)
                                                  keyEquivalent:@"0"];
  zoomResetItem.target = self;
  [viewMenu addItem:zoomResetItem];

  // ---- Window menu (required for tab support) ----
  NSMenuItem *windowRoot = [bar addItemWithTitle:@"Window" action:nil keyEquivalent:@""];
  NSMenu *windowMenu = [[NSMenu alloc] initWithTitle:@"Window"];
  windowRoot.submenu = windowMenu;
  [NSApp setWindowsMenu:windowMenu];

  [windowMenu addItemWithTitle:@"Minimize"
                        action:@selector(performMiniaturize:)
                 keyEquivalent:@"m"];
  [windowMenu addItemWithTitle:@"Zoom"
                        action:@selector(performZoom:)
                 keyEquivalent:@""];
  [windowMenu addItem:[NSMenuItem separatorItem]];
  [windowMenu addItemWithTitle:@"Merge All Windows"
                        action:@selector(mergeAllWindows:)
                 keyEquivalent:@""];
  [windowMenu addItemWithTitle:@"Show All Tabs"
                        action:@selector(toggleTabOverview:)
                 keyEquivalent:@""];
  [windowMenu addItem:[NSMenuItem separatorItem]];
  [windowMenu addItemWithTitle:@"Bring All to Front"
                        action:@selector(arrangeInFront:)
                 keyEquivalent:@""];
}

@end

// ---------------------------------------------------------------------------
// MARK: - Entry point
// ---------------------------------------------------------------------------

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    NSApplication *app      = [NSApplication sharedApplication];
    AppDelegate   *delegate = [[AppDelegate alloc] init];
    app.delegate = delegate;
    [app run];
  }
  return 0;
}
