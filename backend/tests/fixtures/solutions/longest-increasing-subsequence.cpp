#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<long long>t;for(int i=0;i<n;i++){long long x;cin>>x;auto it=lower_bound(t.begin(),t.end(),x);if(it==t.end())t.push_back(x);else *it=x;}cout<<t.size()<<"\n";}
