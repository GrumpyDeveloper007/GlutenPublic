using Gluten.External.Api.Model;
using RestSharp;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Gluten.External.Api.Service
{
    public class IpAddressService
    {
        private static int FreeApiCount = 0;

        public static IpAddressData ReadIpAddressDetails(string ipAddress)
        {
            try
            {
                var options = new RestClientOptions("http://ip-api.com/")
                {
                    //Authenticator = new HttpBasicAuthenticator("username", "password")
                };
                var client = new RestClient(options);
                var request = new RestRequest("json/{ipaddress}");
                request.AddUrlSegment("ipaddress", ipAddress);
                // The cancellation token comes from the caller. You can still make a call without it.
                return client.Get<IpAddressData>(request);
            }
            catch (Exception ex)
            {
                return null;
            }
        }

        //

        public static FreeIp ReadIpAddressDetailsFreeApi(string ipAddress)
        {
            try
            {
                if (FreeApiCount > 50)
                {
                    System.Threading.Thread.Sleep(60000);
                    FreeApiCount = 0;
                }
                var options = new RestClientOptions("https://freeipapi.com")
                {
                    //Authenticator = new HttpBasicAuthenticator("username", "password")
                };
                var client = new RestClient(options);
                var request = new RestRequest("/api/json/{ipaddress}");
                request.AddUrlSegment("ipaddress", ipAddress);
                // The cancellation token comes from the caller. You can still make a call without it.
                FreeApiCount++;
                return client.Get<FreeIp>(request);
            }
            catch (Exception ex)
            {
                return null;
            }
        }

    }
}
