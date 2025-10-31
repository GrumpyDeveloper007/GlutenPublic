using Gluten.Data.Access.DatabaseModel;
using Gluten.Data.Access.Service;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using Gluten.External.Api.Service;
using Gluten.External.Api.Model;
using System.IO;
using Newtonsoft.Json;
using System.Net;
using System.Threading;

namespace Pippin
{
    public class OpenStreetMapsModel
    {
        public string Name
        {
            get
            {
                return $"{Count}";
            }
        }
        public string Longitude { get; set; }
        public string Latitude { get; set; }
        public int Count { get; set; }
        public string IpAddress { get; set; }
    }

    public class OpenStreetMapsViewModel
    {
        public ObservableCollection<OpenStreetMapsModel> Models { get; set; }
        public OpenStreetMapsViewModel()
        {
            Models = [];
        }
    }

    /// <summary>
    /// Interaction logic for Map.xaml
    /// </summary>
    public partial class Map : Window
    {
        private OpenStreetMapsViewModel _model;
        private readonly CloudDataStoreService _dataStore;
        private List<FreeIp> _ipAddresses = [];
        private readonly string IPCacheFileName = "D:\\Coding\\Gluten\\Database\\ipCache.json";

        public Map(CloudDataStoreService dataStore)
        {
            _dataStore = dataStore;
            InitializeComponent();
        }

        public async Task LoadData()
        {
            await Task.Run(async () =>
            {
                _model = new OpenStreetMapsViewModel();

                // Marshal the call back to the UI thread
                Application.Current.Dispatcher.Invoke(() =>
                {
                    DataContext = _model;
                });

                string json;
                if (File.Exists(IPCacheFileName))
                {
                    json = File.ReadAllText(IPCacheFileName);
                    _ipAddresses = JsonConvert.DeserializeObject<List<FreeIp>>(json);
                }

                var ipitems = await _dataStore.GetData<DataQueryDb>($"Where c.Date>'{DateTime.Now.AddDays(-1).ToString("yyyy-MM-dd")}'", CloudDataStoreService.ProductionSuffix);
                foreach (var item in ipitems)
                {
                    var mapItem = _model.Models.SingleOrDefault(o => o.IpAddress == item.IpAddress);
                    if (_model.Models.Count(o => o.IpAddress == item.IpAddress) > 0)
                    {
                        mapItem.Count++;
                        continue;
                    };

                    FreeIp? ipData = null;
                    foreach (var ipAddress in _ipAddresses)
                    {
                        if (ipAddress.ipAddress == item.IpAddress)
                        {
                            ipData = ipAddress;
                            break;
                        }
                    }

                    if (ipData == null)
                    {
                        ipData = IpAddressService.ReadIpAddressDetailsFreeApi(item.IpAddress);
                        _ipAddresses.Add(ipData);
                    }

                    _model.Models.Add(new OpenStreetMapsModel()
                    {
                        Latitude = ipData.latitude.ToString(),
                        Longitude = ipData.longitude.ToString(),
                        IpAddress = item.IpAddress,
                        Count = 1
                    });
                }

                ipitems = await _dataStore.GetData<DataQueryDb>($"Where c.Date>'{DateTime.Now.AddDays(-1).ToString("yyyy-MM-dd")}'", CloudDataStoreService.PreviewSuffix);
                foreach (var item in ipitems)
                {
                    var mapItem = _model.Models.SingleOrDefault(o => o.IpAddress == item.IpAddress);
                    if (_model.Models.Count(o => o.IpAddress == item.IpAddress) > 0)
                    {
                        mapItem.Count++;
                        continue;
                    };
                    FreeIp? ipData = null;
                    foreach (var ipAddress in _ipAddresses)
                    {
                        if (ipAddress.ipAddress == item.IpAddress)
                        {
                            ipData = ipAddress;
                            break;
                        }
                    }

                    if (ipData == null)
                    {
                        ipData = IpAddressService.ReadIpAddressDetailsFreeApi(item.IpAddress);
                        _ipAddresses.Add(ipData);
                    }
                    if (ipData != null)
                    {
                        _ipAddresses.Add(ipData);
                        _model.Models.Add(new OpenStreetMapsModel()
                        {
                            Latitude = ipData.latitude.ToString(),
                            Longitude = ipData.longitude.ToString(),
                            IpAddress = item.IpAddress,
                            Count = 1
                        });
                    }
                }

                using StreamWriter file = File.CreateText(IPCacheFileName);
                JsonSerializer serializer = new();
                serializer.Formatting = Formatting.Indented; // Optional: makes the JSON readable
                serializer.Serialize(file, _ipAddresses);
            });
        }
    }
}
