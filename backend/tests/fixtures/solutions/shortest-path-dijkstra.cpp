#include <bits/stdc++.h>
using namespace std;
int main(){int n,m;cin>>n>>m;vector<vector<pair<int,long long>>>g(n+1);for(int i=0;i<m;i++){int u,v;long long w;cin>>u>>v>>w;g[u].push_back({v,w});}int s;cin>>s;vector<long long>d(n+1,LLONG_MAX);priority_queue<pair<long long,int>,vector<pair<long long,int>>,greater<>>pq;d[s]=0;pq.push({0,s});while(!pq.empty()){auto [du,u]=pq.top();pq.pop();if(du>d[u])continue;for(auto [v,w]:g[u])if(du+w<d[v]){d[v]=du+w;pq.push({d[v],v});}}for(int i=1;i<=n;i++){cout<<(d[i]==LLONG_MAX?-1:d[i])<<(i==n?"\n":" ");}}
