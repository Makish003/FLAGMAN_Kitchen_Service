using System.Diagnostics.Metrics;
namespace Flagman;
public static class Telemetry
{
    static readonly System.Collections.Concurrent.ConcurrentDictionary<string,System.Collections.Concurrent.ConcurrentQueue<double>> Timings=new();
    public static void Timing(string name,double milliseconds){var values=Timings.GetOrAdd(name,_=>new());values.Enqueue(milliseconds);while(values.Count>2000)values.TryDequeue(out _);}
    public static object TimingSnapshot()=>Timings.ToDictionary(x=>x.Key,x=>{var values=x.Value.ToArray().Order().ToArray();return new{count=values.Length,p95Ms=values.Length==0?0:values[(int)Math.Ceiling(values.Length*0.95)-1],maximumMs=values.LastOrDefault()};});
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
