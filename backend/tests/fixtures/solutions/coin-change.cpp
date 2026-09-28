#include <bits/stdc++.h>
using namespace std;
int main(){int n,amt;cin>>n>>amt;vector<int>c(n);for(auto&x:c)cin>>x;const int INF=1e9;vector<int>dp(amt+1,INF);dp[0]=0;for(int a=1;a<=amt;a++)for(int x:c)if(x<=a&&dp[a-x]+1<dp[a])dp[a]=dp[a-x]+1;cout<<(dp[amt]>=INF?-1:dp[amt])<<"\n";}
