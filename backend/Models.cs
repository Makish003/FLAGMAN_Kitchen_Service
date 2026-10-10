namespace Flagman;

public record Product(string Id, string Name, string Unit, decimal WarningHours = 48, bool Archived = false);
public record Ingredient(string ProductId, decimal Quantity);
public record Dish(string Id, string Name, string Category, List<Ingredient> Ingredients, bool Archived = false);
public record Delivery(string Id, string Number, DateTimeOffset CreatedAt, DateTimeOffset ReceivedAt, List<string> BatchIds);
public record Batch(string Id, string DeliveryId, string ProductId, decimal InitialQuantity, decimal RemainingQuantity,
    DateTimeOffset ReceivedAt, DateTimeOffset ExpiresAt, DateTimeOffset? ManufacturedAt, decimal? ShelfLifeHours, string ExpiryBasis,
    decimal? UnitCost = null, string? Currency = null);
public record OrderItem(string DishId, int Portions);
public record Order(string Id, DateTimeOffset CreatedAt, string Status, List<OrderItem> Items, List<Shortage> Shortages);
public record Movement(string Id, string BatchId, string ProductId, decimal Quantity, string Kind, string? OrderId, DateTimeOffset At);
public record Shortage(string ProductId, string ProductName, string Unit, decimal Requested, decimal Available, decimal Missing, List<string> DishIds);
public record ShortageEvent(string Id, string OrderId, DateTimeOffset At, Shortage Detail);
public record DomainEvent(long Id, string Type, DateTimeOffset At);
public record RequestRecord(string Id, string Hash, string ResultJson);
public record AuditEntry(string Id, string Action, string SessionId, DateTimeOffset At, string EntityId);
public record DeliveryLine(string ProductId, decimal Quantity, string Unit, DateTimeOffset? ExpiresAt = null,
    decimal? ShelfLifeHours = null, DateTimeOffset? ManufacturedAt = null, string? ExpiryDate = null,
    decimal? UnitCost = null, string? Currency = null);
public record DeliveryInput(string Number, List<DeliveryLine> Items, DateTimeOffset? ReceivedAt = null, DateTimeOffset? CreatedAt = null, string? Id = null);
public record OrderInput(List<OrderItem> Items);
public record GeneratorInput(int Seed = 42, int IntervalSeconds = 5);
public record Settings(string Timezone = "Europe/Moscow", decimal WarningHours = 48, int DemandWindowDays = 7,
    int PlanningHours = 48, int LeadTimeHours = 12, decimal SafetyFactor = 0.2m, int ForecastHours = 168,
    int OpenHour = 0, int CloseHour = 24, List<int>? OpenDays = null,
    int MinimumHistoryDays = 3, int MinimumHistoryOrders = 10, bool IncludeRejectedDemand = false,
    Dictionary<string, decimal>? ManualDailyDemand = null);
public class State
{
    public List<Product> Products { get; set; } = [];
    public List<Dish> Dishes { get; set; } = [];
    public List<Delivery> Deliveries { get; set; } = [];
    public List<Batch> Batches { get; set; } = [];
    public List<Order> Orders { get; set; } = [];
    public List<Movement> Movements { get; set; } = [];
    public List<ShortageEvent> Shortages { get; set; } = [];
    public List<DomainEvent> Events { get; set; } = [];
    public List<RequestRecord> Requests { get; set; } = [];
    public List<AuditEntry> Audit { get; set; } = [];
    [System.Text.Json.Serialization.JsonIgnore] public string WarningSignature { get; set; } = "";
    [System.Text.Json.Serialization.JsonIgnore] public DateTimeOffset? TransactionRealNow { get; set; }
    public Settings Settings { get; set; } = new();
    public decimal DemoOffsetHours { get; set; }
    public long Revision { get; set; }
    public DateTimeOffset Now(DateTimeOffset realNow) => (TransactionRealNow ?? realNow).AddHours((double)DemoOffsetHours);
    public void Emit(string type, DateTimeOffset now) => Events.Add(new(++Revision, type, now));
}
public class DomainException(string message, int status = 400) : Exception(message) { public int Status { get; } = status; }
