#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<pair<long long,long long>>v(n);for(auto&p:v)cin>>p.first>>p.second;sort(v.begin(),v.end());vector<pair<long long,long long>>r;for(auto&p:v){if(!r.empty()&&p.first<=r.back().second)r.back().second=max(r.back().second,p.second);else r.push_back(p);}cout<<r.size()<<"\n";for(auto&p:r)cout<<p.first<<" "<<p.second<<"\n";}
