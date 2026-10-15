using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.RateLimiting;
using Flagman;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using System.Net;

if (args.Contains("--healthcheck")) { using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) }; try { var response = await client.GetAsync("http://127.0.0.1:8080/api/ready"); Environment.Exit(response.IsSuccessStatusCode ? 0 : 1); } catch { Environment.Exit(1); } return; }

var builder = WebApplication.CreateBuilder(args);
var password = Environment.GetEnvironmentVariable("FLAGMAN_PASSWORD");

var demo = Environment.GetEnvironmentVariable("FLAGMAN_DEMO") == "true";
var dbPath = Environment.GetEnvironmentVariable("FLAGMAN_DB") ?? Path.Combine(builder.Environment.ContentRootPath, "data", "flagman.db");
var keysDirectory = Path.Combine(Path.GetDirectoryName(Path.GetFullPath(dbPath))!, "keys");
Directory.CreateDirectory(keysDirectory);
builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo(keysDirectory)).SetApplicationName("Flagman");
builder.Services.Configure<ForwardedHeadersOptions>(o => {
    o.ForwardedHeaders = ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedFor;
    var proxy = Environment.GetEnvironmentVariable("FLAGMAN_TRUSTED_PROXY");
    if (!string.IsNullOrWhiteSpace(proxy)) o.KnownProxies.Add(IPAddress.Parse(proxy));
});
var storeInstance = new Store(dbPath);
if (storeInstance.Read(s=>s.Users.Count)==0 && (string.IsNullOrWhiteSpace(password)||password.Length<10)) throw new InvalidOperationException("Set FLAGMAN_PASSWORD (at least 10 characters) for the first administrator bootstrap.");
if (!demo && storeInstance.Metadata().DemoOffsetHours != 0) throw new InvalidOperationException("Demo clock detected. Use a separate, new production database; never reset existing inventory time.");
if (demo && storeInstance.Read(Demo.NeedsEnrichment))
    storeInstance.Write(s => Demo.Enrich(s, s.Now(DateTimeOffset.UtcNow)));
storeInstance.Write(s => { AccessService.Bootstrap(s, password!); WorkflowService.ReserveLegacyOrders(s,s.Now(DateTimeOffset.UtcNow)); return 0; });
builder.Services.AddSingleton(storeInstance); builder.Services.AddSingleton<PlanningService>(); builder.Services.AddSingleton<Generator>(); builder.Services.AddHostedService<Flagman.Monitor>();
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(o => {
    o.Cookie.Name = "flagman.session"; o.Cookie.HttpOnly = true; o.Cookie.SameSite = SameSiteMode.Strict;
    o.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
    o.ExpireTimeSpan = TimeSpan.FromHours(8); o.SlidingExpiration = false;
    o.Events.OnValidatePrincipal = async c => { if (!storeInstance.Read(s => AccessService.Valid(s,c.Principal))) { c.RejectPrincipal(); await c.HttpContext.SignOutAsync(); } };
    o.Events.OnRedirectToLogin = c => { c.Response.StatusCode = 401; return Task.CompletedTask; };
    o.Events.OnRedirectToAccessDenied = c => { c.Response.StatusCode = 403; return Task.CompletedTask; };
});
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(o => {
    o.RejectionStatusCode = 429;
    o.OnRejected = async (c, ct) => { c.HttpContext.Response.Headers.RetryAfter = "60"; await c.HttpContext.Response.WriteAsJsonAsync(new { error = "Слишком много попыток. Повторите вход через минуту.", requestId = c.HttpContext.TraceIdentifier }, ct); };
    o.AddPolicy("login", context => RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 128 * 1024);
var app = builder.Build();
app.UseForwardedHeaders();
app.Use(async (ctx, next) => {
    ctx.Response.Headers["X-Request-ID"] = ctx.TraceIdentifier;
    var started = System.Diagnostics.Stopwatch.StartNew();
    ctx.Response.Headers["X-Content-Type-Options"] = "nosniff"; ctx.Response.Headers["X-Frame-Options"] = "DENY";
    ctx.Response.Headers["Referrer-Policy"] = "same-origin";
    ctx.Response.Headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'";
    if (ctx.Request.Path.StartsWithSegments("/api")) ctx.Response.Headers.CacheControl = "no-store";
    if (ctx.Request.Method is not ("GET" or "HEAD" or "OPTIONS"))
    {
        var origin = ctx.Request.Headers.Origin.ToString();
        if (!ctx.Request.Headers.Authorization.ToString().StartsWith("Bearer ",StringComparison.OrdinalIgnoreCase) && (ctx.Request.Headers["X-Requested-With"] != "Flagman" || (origin.Length > 0 && origin != $"{ctx.Request.Scheme}://{ctx.Request.Host}")))
        { ctx.Response.StatusCode = 403; await ctx.Response.WriteAsJsonAsync(new { error = "Запрос записи должен поступить из интерфейса или доверенного API-клиента" }); return; }
    }
    using var writerLease = ctx.Request.Path.StartsWithSegments("/api") && ctx.Request.Method is not ("GET" or "HEAD" or "OPTIONS") && ctx.Request.Path != "/api/planning" && ctx.Request.Path != "/api/scenario" && ctx.Request.Path != "/api/orders/preview" && ctx.Request.Path != "/api/deliveries/preview" ? await storeInstance.AcquireWriter(ctx.RequestAborted) : null;
    try { await next(); }
    catch (DomainException ex) { ctx.Response.StatusCode = ex.Status; await ctx.Response.WriteAsJsonAsync(new { error = ex.Message }); }
    catch (BadHttpRequestException) { ctx.Response.StatusCode = 400; await ctx.Response.WriteAsJsonAsync(new { error = "Некорректное тело запроса" }); }
    catch (JsonException) { ctx.Response.StatusCode = 400; await ctx.Response.WriteAsJsonAsync(new { error = "Некорректный JSON" }); }
    catch (Microsoft.Data.Sqlite.SqliteException ex) when (ex.SqliteErrorCode == 5 && !ctx.Response.HasStarted) { Telemetry.Busy.Add(1); app.Logger.LogWarning(ex,"SQLite busy {RequestId}",ctx.TraceIdentifier);ctx.Response.StatusCode=503;await ctx.Response.WriteAsJsonAsync(new {error="Склад занят. Проверьте результат записи и повторите с прежним ключом.",requestId=ctx.TraceIdentifier}); }
    catch (Exception ex) when (!ctx.Response.HasStarted) { app.Logger.LogError(ex, "API request failed {RequestId}", ctx.TraceIdentifier); ctx.Response.StatusCode = 500; await ctx.Response.WriteAsJsonAsync(new { error = "Ошибка сервера. Результат записи необходимо проверить.", requestId = ctx.TraceIdentifier }); }
    finally { Telemetry.RequestMs.Record(started.Elapsed.TotalMilliseconds); if (ctx.Response.StatusCode >= 500) Telemetry.Errors.Add(1); app.Logger.LogInformation("Request {RequestId} {Method} {Path} {Status} {ElapsedMs}", ctx.TraceIdentifier, ctx.Request.Method, ctx.Request.Path, ctx.Response.StatusCode, started.ElapsedMilliseconds); }
});
app.UseRateLimiter(); app.UseAuthentication();
app.Use(async (ctx,next)=>{
    if(ctx.Request.Headers.Authorization.ToString().StartsWith("Bearer ",StringComparison.OrdinalIgnoreCase)) {
        ctx.User=storeInstance.Read(s=>AccessService.BearerPrincipal(s,ctx.Request.Headers.Authorization.ToString()[7..]));
    }
    var path=(ctx.Request.Path.Value??"").ToLowerInvariant();
    if(path.StartsWith("/api/")&&ctx.User.Identity?.IsAuthenticated==true) {
        var external=path is "/api/session" or "/api/logout" or "/api/events" or "/api/deliveries" or "/api/orders" || path.StartsWith("/api/supplier/")||path.StartsWith("/api/waiter/")||path.StartsWith("/api/cook/")||path.StartsWith("/api/procurement-requests")||path.StartsWith("/api/delivery-requests")||path.StartsWith("/api/order-requests")||path.StartsWith("/api/operations/");
        var adminOnly=path is "/api/accounts" or "/api/demo" or "/api/generator" || path.StartsWith("/api/accounts/")||path.StartsWith("/api/keys/")||path.StartsWith("/api/demo/")||path.StartsWith("/api/generator/")||path.StartsWith("/api/history/generatorevents")||path.StartsWith("/api/history/eventlog");
        if(adminOnly&&!ctx.User.IsInRole("admin")||!external&&!ctx.User.IsInRole("manager")&&!ctx.User.IsInRole("admin")){ctx.Response.StatusCode=403;await ctx.Response.WriteAsJsonAsync(new{error="Недостаточно прав"});return;}
    }
    await next();
});
app.UseAuthorization(); app.UseDefaultFiles(); app.UseStaticFiles();
app.MapGet("/api/live", () => new { status = "ok" });
app.MapGet("/api/health", (Store store) => store.Readiness());
app.MapGet("/api/ready", (Store store) => store.Readiness());
app.MapPost("/api/login", async (LoginInput input, HttpContext ctx) => {
    var account=storeInstance.Read(s=>AccessService.Login(s,input.Login,input.Password));
    if (account is null)
        return Results.Json(new { error = "Неверный пароль" }, statusCode: 401);
    var sessionId=Guid.NewGuid().ToString("N");storeInstance.WriteOperation("audit","",s=>{AccessService.Audit(s,new(account.Id,account.Role),"session.login",account.Id,s.Now(DateTimeOffset.UtcNow));return 0;});
    await ctx.SignInAsync(AccessService.Principal(account,CookieAuthenticationDefaults.AuthenticationScheme));
    return Results.Ok(new { account.Id, account.Name, account.Role, demo });
}).RequireRateLimiting("login");
var api = app.MapGroup("/api").RequireAuthorization();
api.MapAccess();
api.MapWorkflows();
api.MapPost("/batches/{id}/write-off",(string id,WriteOffInput input,HttpContext c,Store st)=>st.Write(s=>Inventory.WriteOff(s,id,input,AccessService.Current(s,c),c.Request.Headers["Idempotency-Key"].ToString(),s.Now(DateTimeOffset.UtcNow))));
api.MapPut("/dishes/{id}/offer",(string id,OfferInput i,HttpContext c,Store st)=>st.Write(s=>OfferPublication.Set(s,id,i,AccessService.Current(s,c),s.Now(DateTimeOffset.UtcNow))));
api.MapGet("/waiter/offers",(HttpContext c,Store st)=>st.Read(s=>{AccessService.RequireRole(AccessService.Actor(c),"manager","waiter");return OfferPublication.Build(s,s.Now(DateTimeOffset.UtcNow));}));
api.MapGet("/offers/overrides",(Store st)=>st.Read(s=>s.OfferOverrides));
api.MapGet("/session", (HttpContext ctx) => new { id=ctx.User.FindFirstValue(ClaimTypes.NameIdentifier),name = ctx.User.Identity!.Name,role=ctx.User.FindFirstValue(ClaimTypes.Role),visiblePages=storeInstance.Read(s=>s.Users.Find(u=>u.Id==ctx.User.FindFirstValue(ClaimTypes.NameIdentifier))?.VisiblePages),timezone=storeInstance.Metadata().Settings.Timezone, demo });
api.MapGet("/ops/status", () => {
    var directory=Environment.GetEnvironmentVariable("FLAGMAN_BACKUP_DIR")??Path.Combine(Path.GetDirectoryName(Path.GetFullPath(dbPath))!,"backups");
    DateTime? backup=Directory.Exists(directory)?Directory.GetFiles(directory,"*.db").Select(File.GetLastWriteTimeUtc).OrderDescending().Select(x=>(DateTime?)x).FirstOrDefault():null;
    return new { monitorLastSuccess = Telemetry.MonitorSuccess, monitorError = Telemetry.MonitorError, sseClients = Interlocked.Read(ref Telemetry.SseClients), lastExpiryLagMs=Telemetry.LastExpiryLagMs, backupAgeHours=backup.HasValue?(double?)(DateTime.UtcNow-backup.Value).TotalHours:null,databaseTimings=Telemetry.TimingSnapshot() };
});
api.AddEndpointFilter(async (context,next) => {
    foreach (var argument in context.Arguments) {
        var valid = argument switch { Dish d => d.Ingredients is not null && d.Ingredients.All(x=>x is not null), DeliveryInput d => d.Items is not null && d.Items.All(x=>x is not null), OrderInput o => o.Items is not null && o.Items.All(x=>x is not null), ProcurementRequestInput p => p.Items is not null && p.Items.All(x=>x is not null), ProcurementResponseInput p => p.Items is not null && p.Items.All(x=>x is not null), DeliveryRequestInput d => d.Items is not null && d.Items.All(x=>x is not null), DeliveryAcceptanceInput d => d.Items is not null && d.Items.All(x=>x is not null), OrderRequestInput o => o.Items is not null && o.Items.All(x=>x is not null), _ => true };
        Inventory.Require(valid, "Заполните состав операции; пустые строки недопустимы");
    }
    return await next(context);
});
api.MapGet("/operations/{scope}/{key}", (string scope, string key, HttpContext ctx, Store store) => { Inventory.Require(new[]{"order","delivery","procurement","procurement-response","procurement-cancel","delivery-acceptance","order-decision","order-serve","write-off"}.Contains(scope), "Неизвестная операция", 404); var actor=AccessService.Actor(ctx); AccessService.RequireRole(actor,scope=="order"?new[]{"manager","waiter"}:scope=="delivery"?new[]{"manager","supplier"}:scope=="procurement-response"?new[]{"supplier"}:scope=="order-decision"?new[]{"cook","manager"}:scope=="order-serve"?new[]{"waiter","manager"}:new[]{"manager"}); var result = store.Operation(WorkflowService.Scope(actor,scope), key); return result is null ? Results.NotFound(new { error = "Результат пока не найден. Повторите исходный запрос с прежним ключом." }) : Results.Content(result, "application/json"); });
api.MapPost("/logout", async (HttpContext ctx,Store store) => { store.WriteOperation("audit","",s=>{AccessService.Audit(s,AccessService.Actor(ctx),"session.logout",AccessService.Actor(ctx).UserId,s.Now(DateTimeOffset.UtcNow));return 0;});await ctx.SignOutAsync(); return Results.Ok(); });
api.MapGet("/snapshot", (Store store) => store.Dashboard());
api.MapPost("/planning", (PlanningInput input,Store store,PlanningService planner)=>{var s=store.PlanningState();return planner.Calculate(s,s.Now(DateTimeOffset.UtcNow),input);});
api.MapPost("/scenario", (ScenarioInput input,Store store)=>{var s=store.PlanningState();return ScenarioDemand.Calculate(s,s.Now(DateTimeOffset.UtcNow),input);});
api.MapPost("/orders/preview", (OrderInput input,Store store)=>{var s=store.PlanningState();return PlanningService.PreviewOrder(s,s.Now(DateTimeOffset.UtcNow),input);});
api.MapPost("/deliveries/preview", (DeliveryInput input,Store store)=>{var s=store.PlanningState();return PlanningService.PreviewDelivery(s,s.Now(DateTimeOffset.UtcNow),input);});
api.MapPost("/products", (Product input, HttpContext ctx, Store store) => store.WriteOperation("product", input.Id, s => {s.EventActorId=AccessService.Actor(ctx).UserId;return Inventory.AddProduct(s, input, s.Now(DateTimeOffset.UtcNow));}));
api.MapPost("/dishes", (Dish input, HttpContext ctx, Store store) => store.WriteOperation("dish", input.Id, s => { s.EventActorId=AccessService.Actor(ctx).UserId;var result=Inventory.SaveDish(s,input,s.Now(DateTimeOffset.UtcNow)); s.Audit.Add(new(Inventory.Id(),"recipe.saved",ctx.User.FindFirst("sessionId")!.Value,DateTimeOffset.UtcNow,input.Id));return result; }));
api.MapGet("/analytics", (DateTimeOffset? from, DateTimeOffset? to, DateOnly? fromDate, DateOnly? toDate, string? days, Store store) => store.Analytics(from,to,fromDate,toDate,days));
api.MapGet("/details/{entity}/{id}", (string entity,string id,Store store)=>store.Details(entity,id));
api.MapPost("/archive/{entity}/{id}", (string entity,string id,HttpContext ctx,Store store)=>store.WriteOperation("archive",id,s=>{
 Inventory.Require(entity is "products" or "dishes","Неизвестный каталог",404);
 if(entity=="products"){ var p=Inventory.Product(s,id);Inventory.Require(!s.Dishes.Any(d=>!d.Archived&&d.Ingredients.Any(i=>i.ProductId==id)),"Сначала архивируйте блюда с этим продуктом",409);s.Products[s.Products.FindIndex(x=>x.Id==id)]=p with {Archived=true}; }
 else {var d=s.Dishes.Find(x=>x.Id==id)??throw new DomainException("Блюдо не найдено",404);s.Dishes[s.Dishes.FindIndex(x=>x.Id==id)]=d with {Archived=true};}
 s.Audit.Add(new(Inventory.Id(),"catalog.archived",ctx.User.FindFirst("sessionId")!.Value,DateTimeOffset.UtcNow,id));s.Emit("catalog.archived",s.Now(DateTimeOffset.UtcNow),id,AccessService.Actor(ctx).UserId);return new {archived=true};
}));
api.MapGet("/history/{entity}", (string entity, int? page, int? size, string? q, string? status, string? sort, Store store) => store.History(entity,page??1,size??50,q,status,sort));
api.MapPut("/settings", (Settings settings, HttpContext ctx, Store store) => { Inventory.ValidateSettings(settings); return store.WriteOperation("settings", "", s => { s.Settings = settings; s.Audit.Add(new(Inventory.Id(),"settings.changed",ctx.User.FindFirst("sessionId")!.Value,DateTimeOffset.UtcNow,"restaurant")); s.Emit("settings.changed", s.Now(DateTimeOffset.UtcNow),"restaurant",AccessService.Actor(ctx).UserId); return settings; }); });
api.MapPost("/demo/seed", (Store store) => { Inventory.Require(demo, "Демо-режим отключён", 403); return store.Write(s => { Demo.Seed(s, s.Now(DateTimeOffset.UtcNow)); return new { seeded = true }; }); });
api.MapPost("/demo/time", (TimeInput input, Store store) => { Inventory.Require(demo, "Демо-режим отключён", 403); Inventory.Require(input.Hours is > 0 and <= 720, "Сдвиг: больше 0, не более 720 часов"); return store.Write(s => { s.DemoOffsetHours += input.Hours; var now = s.Now(DateTimeOffset.UtcNow); Inventory.Expire(s, now); s.Emit("time.changed", now); return new { now }; }); });
api.MapGet("/generator", (Generator generator) => generator.Status);
api.MapPost("/generator/start", (GeneratorInput input, Generator generator,HttpContext ctx,Store store) => { Inventory.Require(demo, "Генератор доступен только в демо", 403); generator.Start(input);store.Write(s=>{AccessService.Audit(s,AccessService.Actor(ctx),"generator.started","restaurant",s.Now(DateTimeOffset.UtcNow));return 0;}); return generator.Status; });
api.MapPost("/generator/stop", (Generator generator,HttpContext ctx,Store store) => { generator.Stop();store.Write(s=>{AccessService.Audit(s,AccessService.Actor(ctx),"generator.stopped","restaurant",s.Now(DateTimeOffset.UtcNow));return 0;}); return generator.Status; });
api.MapGet("/events", async (HttpContext ctx, Store store) => {
    Interlocked.Increment(ref Telemetry.SseClients);
    try {
    ctx.Response.ContentType = "text/event-stream"; ctx.Response.Headers["X-Accel-Buffering"] = "no";
    var cursor = long.TryParse(ctx.Request.Headers["Last-Event-ID"], out var last) ? last : 0;
    var revision = store.Metadata().Revision;
    await ctx.Response.WriteAsync($"event: sync\ndata: {{\"revision\":{revision}}}\n\n", ctx.RequestAborted);
    await ctx.Response.Body.FlushAsync(ctx.RequestAborted);
    using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
    try {
        while (await timer.WaitForNextTickAsync(ctx.RequestAborted)) {
            if(!store.Read(s=>AccessService.Valid(s,ctx.User))) break;
            var events = store.EventsAfter(cursor);
            foreach (var e in events) { await ctx.Response.WriteAsync($"id: {e.Id}\nevent: change\ndata: {JsonSerializer.Serialize(new {revision=e.Id}, Store.Json)}\n\n", ctx.RequestAborted); cursor = e.Id; }
            if (events.Count == 0) await ctx.Response.WriteAsync(": heartbeat\n\n", ctx.RequestAborted);
            await ctx.Response.Body.FlushAsync(ctx.RequestAborted);
        }
    } catch (OperationCanceledException) { }
    } finally { Interlocked.Decrement(ref Telemetry.SseClients); }
});
app.Map("/api/{**path}", () => Results.NotFound(new { error = "API-маршрут не найден" }));
app.MapFallbackToFile("index.html");
app.Run();
record LoginInput(string? Login,string? Password);
record TimeInput(decimal Hours);
