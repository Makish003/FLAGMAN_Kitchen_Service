namespace Flagman;
public record Actor(string UserId,string Role);
public record UserAccount(string Id,string Login,string Name,string Role,bool Active,string PasswordHash,int SessionVersion=1,List<string>? VisiblePages=null);
public record ApiCredential(string Id,string UserId,string Hash,DateTimeOffset CreatedAt,DateTimeOffset? RevokedAt,int SessionVersion);
public record AccountInput(string Login,string Name,string Role,string? Password,bool Active=true,List<string>? VisiblePages=null);
