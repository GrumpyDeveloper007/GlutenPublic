using Gluten.Data.Access.Service;
using Microsoft.Extensions.Configuration;
using System;
using System.Collections.Generic;
using System.Threading;
using System.Windows;


namespace Pippin
{
    /// <summary>
    /// Interactive google maps helper tool, used to extract information from searches 
    /// </summary>
    public partial class MainWindow : Window
    {
        private CloudDataStoreService _database;

        public MainWindow()
        {
            InitializeComponent();

            IConfigurationRoot config = new ConfigurationBuilder()
                .AddJsonFile("local.settings.json")
                .Build();
            var settings = config.GetRequiredSection("Values").Get<SettingValues>();

            Syncfusion.Licensing.SyncfusionLicenseProvider.RegisterLicense(settings.SyncFusionKey);

            Thread thread = new Thread(new ThreadStart(() => ConnectDb(settings.DbEndpointUri, settings.DbPrimaryKey)));
            thread.Start();
        }

        private void ConnectDb(string EndpointUri, string PrimaryKey)
        {
            _database = new CloudDataStoreService(EndpointUri, PrimaryKey);
        }

        private async void butOpenMap_Click(object sender, RoutedEventArgs e)
        {
            var map = new Map(_database);
            await map.LoadData();
            map.Show();
        }
    }
}
