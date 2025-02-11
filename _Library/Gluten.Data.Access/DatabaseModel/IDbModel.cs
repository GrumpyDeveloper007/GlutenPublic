namespace Gluten.Data.Access.DatabaseModel
{
    public interface IDbModel
    {
        string Id { get; }
        string PartitionKey { get; }
        string GetContainerId();
    }

}
