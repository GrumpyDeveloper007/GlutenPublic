using Gluten.Data.Access.DatabaseModel;
using Microsoft.Azure.Cosmos;
using System.Net;

namespace Gluten.Data.Access.Service
{
    /// <summary>
    /// Provides generic access to the cloud DB
    /// </summary>
    public class CloudDataStoreService : IDisposable
    {
        private const string DatabaseId = "gluencosmos";
        private readonly DbMapperService _mappingService = new();
        private readonly CosmosClient _cosmosClient;
        private readonly Database _database;
        private readonly Dictionary<string, Container> _containers = [];

        public const string ProductionSuffix = "";
        public const string PreviewSuffix = "-preview";

        /// <summary>
        /// Constructor
        /// </summary>
        public CloudDataStoreService(string EndpointUri, string PrimaryKey)
        {
            _cosmosClient = new(EndpointUri, PrimaryKey, new CosmosClientOptions() { ApplicationName = "TheShire" });
            _database = _cosmosClient.CreateDatabaseIfNotExistsAsync(DatabaseId).Result;
        }

        /// <summary>
        /// Get all objects of a specific type
        /// </summary>
        public async Task<List<returnType>> GetData<dbObject, returnType>(string suffix) where dbObject : IDbModel, new()
        {
            return await GetData<dbObject, returnType>("", suffix);
        }

        /// <summary>
        /// Delete all data
        /// </summary>
        public async Task DeleteContainer<dbObject>(string suffix) where dbObject : IDbModel, new()
        {
            var model = new dbObject();
            var container = await GetContainer<dbObject>(model, suffix);
            await container.DeleteContainerAsync();
            _containers.Remove($"{model.GetContainerId()}{suffix}");
        }

        /// <summary>
        /// Get data object based on a given filter
        /// </summary>
        public async Task<List<returnType>> GetData<dbObject, returnType>(string whereClause, string suffix) where dbObject : IDbModel, new()
        {
            var container = await GetContainer<dbObject>(new dbObject(), suffix);
            var sqlQueryText = $"SELECT * FROM c {whereClause}";

            var queryDefinition = new QueryDefinition(sqlQueryText);
            var queryResultSetIterator = container.GetItemQueryIterator<dbObject>(queryDefinition);

            var results = new List<returnType>();

            while (queryResultSetIterator.HasMoreResults)
            {
                var currentResultSet = await queryResultSetIterator.ReadNextAsync();
                foreach (var PinTopicDb in currentResultSet)
                {
                    var item = _mappingService.Map<returnType, dbObject>(PinTopicDb);
                    results.Add(item);
                }
            }
            return results;
        }

        /// <summary>
        /// Gets database data object with search criteria
        /// </summary>
        public async Task<List<dbObject>> GetData<dbObject>(string whereClause, string suffix) where dbObject : IDbModel, new()
        {
            var container = await GetContainer<dbObject>(new dbObject(), suffix);
            var sqlQueryText = $"SELECT * FROM c {whereClause}";

            var queryDefinition = new QueryDefinition(sqlQueryText);
            var queryResultSetIterator = container.GetItemQueryIterator<dbObject>(queryDefinition);

            var results = new List<dbObject>();

            while (queryResultSetIterator.HasMoreResults)
            {
                var currentResultSet = await queryResultSetIterator.ReadNextAsync();
                foreach (var dbItem in currentResultSet)
                {
                    results.Add(dbItem);
                }
            }
            return results;
        }

        /// <summary>
        /// Deletes an data item
        /// </summary>
        public async Task DeleteItemAsync<dbObject>(dbObject newDbItem, string suffix) where dbObject : IDbModel, new()
        {
            var container = await GetContainer<dbObject>(new dbObject(), suffix);
            await container.DeleteItemAsync<dbObject>(newDbItem.Id, new PartitionKey(newDbItem.PartitionKey));
        }

        //public async Task DeletePartitionAsync<dbObject>(dbObject newDbItem) where dbObject : IDbModel, new()
        //{
        //    var container = await GetContainer<dbObject>(new dbObject());
        //    await container.DeleteAllItemsByPartitionKeyStreamAsync(new PartitionKey(newDbItem.PartitionKey));
        //}


        /// <summary>
        /// Update data object
        /// </summary>
        public async Task ReplaceItemAsync<dbObject>(dbObject newDbItem, string suffix) where dbObject : IDbModel, new()
        {
            var container = await GetContainer<dbObject>(newDbItem, suffix);

            try
            {
                await container.UpsertItemAsync(newDbItem);
            }
            catch (CosmosException ex)
            {
                Console.WriteLine($"{ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// TODO
        /// </summary>
        public async Task ScaleContainerAsync<dbObject>(int newThroughput, string suffix) where dbObject : IDbModel, new()
        {
            var container = await GetContainer<dbObject>(new dbObject(), suffix);
            // Read the current throughput
            try
            {
                int? throughput = await container.ReadThroughputAsync();
                if (throughput.HasValue)
                {
                    Console.WriteLine("Current provisioned throughput : {0}\n", throughput.Value);
                    // Update throughput
                    await container.ReplaceThroughputAsync(newThroughput);
                    Console.WriteLine("New provisioned throughput : {0}\n", newThroughput);
                }
            }
            catch (CosmosException cosmosException) when (cosmosException.StatusCode == HttpStatusCode.BadRequest)
            {
                Console.WriteLine("Cannot read container throuthput.");
                Console.WriteLine(cosmosException.ResponseBody);
            }
        }


        /*

        private async Task DeletePinTopicDbItemAsync()
        {
            var container = await GetContainer(new PinTopicDb());
            var partitionKeyValue = "Wakefield";
            var PinTopicDbId = "Wakefield.7";

            // Delete an item. Note we must provide the partition key value and id of the item to delete
            ItemResponse<PinTopicDb> wakefieldPinTopicDbResponse = await container.DeleteItemAsync<PinTopicDb>(PinTopicDbId, new PartitionKey(partitionKeyValue));
            Console.WriteLine("Deleted PinTopicDb [{0},{1}]\n", partitionKeyValue, PinTopicDbId);
        }

        private async Task DeleteDatabaseAndCleanupAsync()
        {
            DatabaseResponse databaseResourceResponse = await _database.DeleteAsync();
            // Also valid: await this.cosmosClient.Databases["PinTopicDbDatabase"].DeleteAsync();

            Console.WriteLine("Deleted Database: {0}\n", DatabaseId);

            //Dispose of CosmosClient
            _cosmosClient.Dispose();
        }
        */

        /// <summary>
        /// Close database
        /// </summary>
        public void Dispose()
        {
            _cosmosClient.Dispose();
        }

        private async Task<Container> GetContainer<dbModel>(dbModel model, string suffix) where dbModel : IDbModel
        {
            Container? container = null;
            try
            {
                if (!_containers.TryGetValue($"{model.GetContainerId()}{suffix}", out container))
                {
                    container = await _database.CreateContainerIfNotExistsAsync($"{model.GetContainerId()}{suffix}", "/partitionKey");
                    _containers.TryAdd($"{model.GetContainerId()}{suffix}", container);
                }
            }
            catch (Exception ex)
            {
                // TODO: sometimes get a concurrency error
                _containers.TryGetValue($"{model.GetContainerId()}{suffix}", out container);
            }
            return container;
        }

    }
}
