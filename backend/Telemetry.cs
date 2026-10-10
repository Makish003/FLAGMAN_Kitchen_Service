using System.Diagnostics.Metrics;
namespace Flagman;
public static class Telemetry
{
    static readonly Meter Meter = new("Flagman", "1.1.0");
    public static readonly Histogram<double> RequestMs = Meter.CreateHistogram<double>("flagman.request.ms");
    public static readonly Counter<long> Errors = Meter.CreateCounter<long>("flagman.errors");
    public static readonly Counter<long> Busy = Meter.CreateCounter<long>("flagman.sqlite.busy");
    public static readonly Histogram<double> ExpiryLag = Meter.CreateHistogram<double>("flagman.expiry.lag.ms");
    public static double LastExpiryLagMs { get; set; }
    public static DateTimeOffset? MonitorSuccess { get; set; }
    public static string? MonitorError { get; set; }
    public static long SseClients;
}
