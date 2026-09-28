#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<long long>a(n);for(auto&x:a)cin>>x;long long t;cin>>t;int lo=0,hi=n-1,ans=-1;while(lo<=hi){int mid=lo+(hi-lo)/2;if(a[mid]==t){ans=mid;break;}if(a[mid]<t)lo=mid+1;else hi=mid-1;}cout<<ans<<"\n";}
