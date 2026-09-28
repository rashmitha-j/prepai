#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<long long>a(n);for(auto&x:a)cin>>x;long long t;cin>>t;unordered_map<long long,int>m;for(int i=0;i<n;i++){auto it=m.find(t-a[i]);if(it!=m.end()){cout<<it->second<<" "<<i<<"\n";return 0;}m[a[i]]=i;}return 0;}
